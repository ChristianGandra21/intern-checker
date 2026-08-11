from __future__ import annotations

import csv
import hashlib
import io
import logging
from datetime import UTC, datetime
from urllib.parse import quote, urlsplit
from zoneinfo import ZoneInfo

import aiohttp
from dateutil import parser as date_parser

from ..area import classify_area
from ..http import get_text_with_retry, random_headers
from ..models import JobCandidate
from ..normalize import clean_text, plain

log = logging.getLogger(__name__)

COMMUNITY_COLUMNS = {
    "Data de Inclusão": "included_at",
    "Area": "area",
    "Empresa": "company",
    "Cidade": "location",
    "Titulo da Vaga": "title",
    "Link": "link",
    "Tipo de Vaga": "job_type",
    "Redes Sociais": "social",
    "Plataforma": "platform",
}
REQUIRED_COLUMNS = set(COMMUNITY_COLUMNS)
class InvalidCommunitySheet(RuntimeError):
    """A resposta não corresponde à aba mensal solicitada."""


def _current_month(timezone: str = "America/Sao_Paulo", now: datetime | None = None) -> datetime:
    current = now or datetime.now(ZoneInfo(timezone))
    if current.tzinfo is None:
        current = current.replace(tzinfo=ZoneInfo(timezone))
    return current.astimezone(ZoneInfo(timezone))


def _sheet_aliases(current: datetime) -> list[str]:
    # O GViz aceita MM/YYYY para as abas reais MMYYYY. Tentamos ambos, mas
    # validamos as datas porque aliases numéricos inválidos retornam a primeira aba.
    return [current.strftime("%m/%Y"), current.strftime("%m%Y")]


def _parse_date(value: str) -> datetime | None:
    if not value:
        return None
    try:
        parsed = date_parser.parse(value, dayfirst=True)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    except (TypeError, ValueError):
        return None


def _valid_http_url(value: str) -> str | None:
    try:
        parsed = urlsplit(value)
    except ValueError:
        return None
    return value if parsed.scheme in {"http", "https"} and bool(parsed.netloc) else None


def _is_internship(mapped: dict[str, str]) -> bool:
    return plain(mapped.get("job_type", "")) == "estagio"


def _row_to_job(
    row: dict[str, str],
    sheet_name: str,
    spreadsheet_id: str = "",
    row_number: int = 0,
) -> JobCandidate | None:
    mapped = {target: clean_text(row.get(source, "")) for source, target in COMMUNITY_COLUMNS.items()}
    title = mapped.get("title") or f"{mapped.get('job_type', 'Vaga')} {mapped.get('company', '')}"
    if not title or not _is_internship(mapped):
        return None
    area = classify_area(f"{mapped.get('area', '')} {title}", mapped.get("platform", ""))

    primary_link = _valid_http_url(mapped.get("link", ""))
    social_link = _valid_http_url(mapped.get("social", ""))
    evidence_url = (
        f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/edit?sheet={quote(sheet_name)}"
        if spreadsheet_id
        else None
    )
    source_url = primary_link or social_link or evidence_url
    if not source_url:
        return None

    source_host = urlsplit(primary_link or social_link or "").hostname or ""
    is_social_host = source_host == "linkedin.com" or source_host.endswith(".linkedin.com") or source_host in {"x.com", "twitter.com"}
    link_kind = "social" if is_social_host else "official" if primary_link else "social" if social_link else "sheet"
    stable_identity = "|".join(
        (
            spreadsheet_id,
            sheet_name,
            plain(mapped.get("company", "")),
            plain(title),
            primary_link or social_link or "sem-link",
        )
    )
    external_id = hashlib.sha256(stable_identity.encode()).hexdigest()
    description = " | ".join(
        part
        for part in (
            mapped.get("area"),
            mapped.get("job_type"),
            mapped.get("platform"),
            f"aba {sheet_name}",
        )
        if part
    )
    return JobCandidate(
        title=title,
        company=mapped.get("company") or "Não informada",
        description=description,
        location=mapped.get("location") or "",
        source="Planilha comunitária",
        source_url=source_url,
        published_at=_parse_date(mapped.get("included_at", "")),
        source_type="community",
        external_id=external_id,
        area_fit=area.area_fit,
        area_reasons=area.reasons,
        primary_area=area.primary_area,
        area_tags=area.area_tags,
        match_area=area.area_fit == "tech",
        raw_payload={
            "sheet": sheet_name,
            "row_number": row_number,
            "link_kind": link_kind,
            "original_link": mapped.get("link", ""),
            "social_link": mapped.get("social", ""),
            "row": mapped,
        },
    )


def _parse_month_csv(
    text: str, spreadsheet_id: str, requested_alias: str, current: datetime
) -> list[JobCandidate]:
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames or not REQUIRED_COLUMNS.issubset(set(reader.fieldnames)):
        raise InvalidCommunitySheet("cabeçalho esperado não encontrado")
    rows = list(reader)
    populated = [row for row in rows if clean_text(row.get("Titulo da Vaga", ""))]
    dated = [_parse_date(clean_text(row.get("Data de Inclusão", ""))) for row in populated]
    valid_dates = [value for value in dated if value]
    if populated and not any(
        value.month == current.month and value.year == current.year for value in valid_dates
    ):
        raise InvalidCommunitySheet(
            f"a resposta de {requested_alias} não contém linhas de {current:%m/%Y}; provável aba padrão"
        )
    return [
        job
        for row_number, row in enumerate(rows, start=2)
        if (job := _row_to_job(row, current.strftime("%m%Y"), spreadsheet_id, row_number))
    ]


async def _collect_alias(
    session: aiohttp.ClientSession,
    spreadsheet_id: str,
    alias: str,
    current: datetime,
) -> list[JobCandidate]:
    url = (
        f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/gviz/tq"
        f"?tqx=out:csv&sheet={quote(alias, safe='')}"
    )
    text = await get_text_with_retry(session, url)
    return _parse_month_csv(text, spreadsheet_id, alias, current)


async def collect_community_sheets(config: dict) -> list[JobCandidate]:
    if not config or not config.get("spreadsheet_id"):
        return []
    spreadsheet_id = str(config["spreadsheet_id"])
    current = _current_month(str(config.get("timezone", "America/Sao_Paulo")))
    errors: list[str] = []
    async with aiohttp.ClientSession(headers=random_headers()) as session:
        for alias in _sheet_aliases(current):
            try:
                jobs = await _collect_alias(session, spreadsheet_id, alias, current)
                log.info("Community sheet %s returned %d technology internships", alias, len(jobs))
                return jobs
            except Exception as exc:  # noqa: BLE001 - one alias must not stop the other sources
                errors.append(f"{alias}: {exc}")
    log.error("Current community sheet unavailable (%s)", "; ".join(errors))
    return []
