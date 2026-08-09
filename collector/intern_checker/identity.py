from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from .models import JobCandidate


def plain(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    normalized = "".join(char for char in normalized if not unicodedata.combining(char)).lower()
    return " ".join(normalized.replace("'", "").replace("’", "").split())


def canonical_url(value: str) -> str:
    parts = urlsplit(value)
    query = urlencode([(key, val) for key, val in parse_qsl(parts.query) if not key.lower().startswith("utm_")])
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path.rstrip("/"), query, ""))

RULES = json.loads(
    (Path(__file__).resolve().parents[2] / "config" / "dedup-rules.json").read_text(encoding="utf-8")
)


@dataclass(frozen=True)
class DedupIdentity:
    key: str
    confidence: int
    reasons: list[str]
    cycle: str | None
    tokens: list[str]


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _cycle(value: str) -> str | None:
    match = re.search(r"\b20\d{2}(?:[ .\/-]?[12])?\b", plain(value))
    return re.sub(r"[ .\/-]", ".", match.group()) if match else None


def _company(value: str) -> str:
    normalized = plain(value)
    return "" if not normalized or any(term in normalized for term in ("nao informada", "rss", "google news")) else normalized


def identity_tokens(value: str) -> list[str]:
    ignored = set(RULES["generic_terms"])
    normalized = re.sub(r"[^a-z0-9 ]", " ", plain(value))
    return sorted({token for token in normalized.split() if len(token) > 1 and token not in ignored})


def _is_program(value: str) -> bool:
    normalized = plain(value)
    return any(term in normalized for term in RULES["program_signals"])


def build_dedup_identity(job: JobCandidate) -> DedupIdentity:
    best_url = str(job.application_url or job.official_url or "")
    cycle = _cycle(f"{job.title} {job.description}")
    company = _company(job.company)
    title = re.split(r"\s(?:[-–—|])\s", job.title, maxsplit=1)[0]
    tokens = identity_tokens(f"{company} {title}")
    if job.external_id and best_url:
        host = urlsplit(best_url).hostname or "unknown"
        return DedupIdentity(_digest(f"external:{host}:{job.external_id}"), 100, ["mesmo identificador externo"], cycle, tokens)
    if best_url:
        return DedupIdentity(_digest(f"official:{canonical_url(best_url)}"), 98, ["mesma URL oficial"], cycle, tokens)
    if _is_program(job.title) and tokens:
        confidence = 92 if company else 82
        return DedupIdentity(_digest(f"program:{cycle or 'unknown'}:{'|'.join(tokens)}"), confidence, ["mesmo programa, organização e ciclo"], cycle, tokens)
    normalized_title = re.sub(r"\b(estagio|estagiario|estagiaria|intern)\b", "", plain(job.title)).strip()
    location = plain(job.location)
    return DedupIdentity(
        _digest(f"role:{company or 'unknown'}:{normalized_title}:{location}:{cycle or 'unknown'}"),
        88 if company else 60,
        ["mesma empresa, cargo, local e ciclo"],
        cycle,
        identity_tokens(f"{company} {normalized_title}"),
    )


def likely_same_opportunity(left_job: JobCandidate, right_job: JobCandidate) -> tuple[bool, int, str]:
    left = build_dedup_identity(left_job)
    right = build_dedup_identity(right_job)
    if left.key == right.key:
        return True, min(left.confidence, right.confidence), left.reasons[0]
    if left.cycle and right.cycle and left.cycle != right.cycle:
        return False, 0, "ciclos diferentes"
    left_company = _company(left_job.company)
    right_company = _company(right_job.company)
    if left_company and right_company and left_company != right_company:
        return False, 0, "empresas diferentes"
    shared = set(left.tokens) & set(right.tokens)
    overlap = len(shared) / max(1, min(len(left.tokens), len(right.tokens)))
    distinctive = [token for token in shared if len(token) >= 3]
    programs = _is_program(left_job.title) and _is_program(right_job.title)
    same_program = programs and (
        overlap >= 0.6 or len(distinctive) >= 2
    )
    left_location = plain(left_job.location)
    right_location = plain(right_job.location)
    compatible_location = (
        not left_location
        or not right_location
        or left_location == right_location
        or left_location in right_location
        or right_location in left_location
    )
    same_role = not programs and bool(left_company and right_company) and compatible_location and overlap >= 0.85
    same = same_program or same_role
    confidence = max(88 if same_role else 80, round(overlap * 100)) if same else round(overlap * 100)
    reason = (
        "mesma empresa, função altamente semelhante e local compatível"
        if same_role
        else "programas com entidade e termos distintivos compatíveis"
    )
    return same, confidence, reason
