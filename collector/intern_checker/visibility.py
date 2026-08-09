from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from urllib.parse import urlsplit

from .models import JobCandidate
from .normalize import plain

CLASSIFICATION_VERSION = "radar-v1"
INTERNSHIP = re.compile(
    r"(?<!\w)(estagio|estagiari[oa]s?|internship|intern|programa (?:de )?estagio|summer intern)(?!\w)"
)
GENERIC_TITLE = re.compile(
    r"^(vagas?|carreiras?|oportunidades?|saiba mais|acesse|clique aqui|ver vagas?|estagio|home|inicio)$"
)
NON_JOB_TITLE = re.compile(
    r"(?<!\w)(concurso|vestibular|fies|cursos? gratuito|professor(?:a|es)?|licitacao|premio|"
    r"nomeacao|jovem aprendiz|aprendizagem)(?!\w)"
)
SENIOR_TITLE = re.compile(r"(?<!\w)(senior|staff|principal|lead)(?!\w)")
CLOSED = re.compile(
    r"(?<!\w)(vaga encerrada|inscricoes encerradas?|processo seletivo encerrado|nao esta mais aceitando|"
    r"job (?:is )?closed|position (?:has been )?filled|no longer accepting)(?!\w)"
)


def _listing_url(job: JobCandidate) -> bool:
    path = urlsplit(str(job.source_url)).path.rstrip("/").lower()
    return path in {"", "/jobs", "/vagas", "/careers", "/carreiras", "/estudantes"} or "job-search" in path


def _objectively_hidden(job: JobCandidate) -> bool:
    title = plain(job.title)
    content = plain(f"{job.title} {job.description}")
    mixed_program = bool(INTERNSHIP.search(content) and re.search(r"(?<!\w)trainee(?!\w)", title))
    bad_title = bool(
        GENERIC_TITLE.fullmatch(title)
        or NON_JOB_TITLE.search(title)
        or SENIOR_TITLE.search(title)
        or (re.search(r"(?<!\w)trainee(?!\w)", title) and not mixed_program)
    )
    http_status = int(job.raw_payload.get("official_http_status") or job.raw_payload.get("http_status") or 0)
    expired = bool(job.application_deadline and job.application_deadline < datetime.now(UTC))
    stale_news = bool(
        job.source_type == "news"
        and job.published_at
        and not job.application_deadline
        and job.published_at < datetime.now(UTC) - timedelta(days=120)
    )
    return bad_title or _listing_url(job) or bool(CLOSED.search(content)) or http_status in {404, 410} or expired or stale_news


def target_fit(job: JobCandidate) -> str:
    title = plain(job.title)
    content = plain(job.description)
    full = f"{title} {content}"
    old_title = re.search(r"(?<!\w)20(?:1\d|2[0-6])(?:[.\/-]?\d)?(?!\w)", title) and not re.search(
        r"(?<!\w)2027(?:[.\/-]?[12])?(?!\w)", title
    )
    old_context = re.search(
        r"(?<!\w)(?:inicio|comeco|ciclo|turma|semestre|programa (?:de )?estagio|estagio)(?!\w).{0,70}"
        r"(?<!\w)20(?:1\d|2[0-6])(?:[.\/-]?\d)?(?!\w)",
        content,
    )
    if old_title or (old_context and not re.search(r"(?<!\w)2027(?!\w)", full)):
        return "incompatible"
    if re.search(r"(?<!\w)(?:2027[.\/-]?1|1[.\/-]2027|primeiro semestre (?:de )?2027)(?!\w)", full):
        return "confirmed"
    if re.search(r"(?<!\w)2027(?!\w)", full):
        return "probable"
    return "unknown"


def location_fit(job: JobCandidate) -> str:
    if job.work_mode == "remote":
        return "confirmed"
    location = plain(job.location)
    if re.search(r"(?<!\w)(sao paulo|osasco|barueri|abc paulista|campinas|guarulhos|sp,? br)(?!\w)", location):
        return "confirmed"
    if re.search(r"(?<!\w)(remoto|remote|home office)(?!\w)", location):
        return "confirmed"
    if not location or location in {"br", "brasil", "brazil", "nao informado", "unknown"}:
        return "unknown"
    outside = re.search(
        r"(?<!\w)(canada|united states|usa|estados unidos|europe|europa|united kingdom|uk|reino unido|"
        r"mexico|argentina|chile|colombia|india|australia|rio de janeiro|rj|minas gerais|mg|bahia|ba|"
        r"parana|pr|santa catarina|sc|rio grande do sul|rs|pernambuco|pe|ceara|ce|distrito federal|df)(?!\w)",
        location,
    )
    return "incompatible" if job.work_mode in {"onsite", "hybrid"} and outside else "unknown"


def classify_visibility(job: JobCandidate) -> JobCandidate:
    target = target_fit(job)
    location = location_fit(job)
    reasons: list[str] = []
    if target == "unknown":
        reasons.append("ano de início não informado")
    if location == "unknown":
        reasons.append("localização não confirmada")
    if not job.official_url and not job.application_url:
        reasons.append("link oficial pendente")
    if target == "incompatible":
        reasons.append("ciclo explicitamente incompatível")
    if location == "incompatible":
        reasons.append("localização explicitamente incompatível")
    compatible = (
        job.area_fit in {"tech", "general"}
        and bool(INTERNSHIP.search(plain(f"{job.title} {job.description}")))
        and target != "incompatible"
        and location != "incompatible"
        and not _objectively_hidden(job)
    )
    if not compatible:
        tier = "hidden"
    elif target in {"confirmed", "probable"} and location in {"confirmed", "probable"} and job.score >= 55:
        tier = "strong"
        reasons.append("ciclo e localização compatíveis")
    else:
        tier = "watchlist"
        reasons.append("oportunidade compatível aguardando confirmação")
    job.target_fit = target  # type: ignore[assignment]
    job.location_fit = location  # type: ignore[assignment]
    job.display_tier = tier  # type: ignore[assignment]
    job.display_reasons = list(dict.fromkeys(reasons))
    job.classification_version = CLASSIFICATION_VERSION
    return job
