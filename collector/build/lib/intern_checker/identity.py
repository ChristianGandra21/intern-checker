from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass
from importlib.resources import files
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
    files("intern_checker").joinpath("data/dedup-rules.json").read_text(encoding="utf-8")
)


@dataclass(frozen=True)
class DedupIdentity:
    key: str
    confidence: int
    reasons: list[str]
    cycle: str | None
    tokens: list[str]


@dataclass(frozen=True)
class DedupContext:
    identity: DedupIdentity
    company: str
    location: str
    program: bool
    tokens: frozenset[str]


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _cycle(value: str) -> str | None:
    match = re.search(r"\b20\d{2}(?:[ .\/-]?[12])?\b", plain(value))
    return re.sub(r"[ .\/-]", ".", match.group()) if match else None


def _company(value: str) -> str:
    normalized = plain(value)
    if not normalized or any(term in normalized for term in ("nao informada", "rss", "google news")):
        return ""
    qualifiers = {"grupo", "rede", "brasil", "brazil", "companhia", "company", "sa", "ltda", "inc"}
    return " ".join(token for token in normalized.split() if token not in qualifiers)


def identity_tokens(value: str) -> list[str]:
    ignored = set(RULES["generic_terms"])
    normalized = re.sub(r"[^a-z0-9 ]", " ", plain(value))
    return sorted({token for token in normalized.split() if len(token) > 1 and token not in ignored})


def _is_program(value: str) -> bool:
    normalized = plain(value)
    return any(term in normalized for term in RULES["program_signals"])


def _program_family(value: str, company: str, news: bool) -> str:
    normalized = plain(value)
    if "jovens talentos" in normalized:
        family = "jovens-talentos"
    elif "early careers" in normalized:
        family = "early-careers"
    elif "summer internship" in normalized:
        family = "summer-internship"
    else:
        family = "programa-estagio"
    if news:
        return family
    company_tokens = set(identity_tokens(company))
    title = re.split(r"\s(?:[-–—|])\s", value, maxsplit=1)[0]
    distinctive = [
        token for token in identity_tokens(title) if token not in company_tokens and not token.isdigit()
    ]
    return f"{family}:{'|'.join(distinctive)}" if distinctive else family


def build_dedup_identity(job: JobCandidate) -> DedupIdentity:
    best_url = str(job.application_url or job.official_url or "")
    cycle = _cycle(f"{job.title} {job.description}")
    company = _company(job.company)
    title = re.split(r"\s(?:[-–—|])\s", job.title, maxsplit=1)[0]
    tokens = identity_tokens(f"{company} {title}")
    news = job.source_type == "news" or job.source in {"RSS", "Google Alerts"}
    program = _is_program(job.title) or bool(
        news and re.search(r"(?<!\w)(estagio|internship)(?!\w)", plain(job.title)) and cycle
    )
    if program and company:
        return DedupIdentity(
            _digest(f"program:{company}:{_program_family(job.title, company, news)}:{cycle or 'unknown'}"),
            94,
            ["mesmo programa, organização e ciclo"],
            cycle,
            tokens,
        )
    if job.external_id and best_url:
        host = urlsplit(best_url).hostname or "unknown"
        return DedupIdentity(_digest(f"external:{host}:{job.external_id}"), 100, ["mesmo identificador externo"], cycle, tokens)
    if best_url:
        return DedupIdentity(_digest(f"official:{canonical_url(best_url)}"), 98, ["mesma URL oficial"], cycle, tokens)
    if program and tokens:
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


def build_dedup_context(job: JobCandidate) -> DedupContext:
    identity = build_dedup_identity(job)
    return DedupContext(
        identity=identity,
        company=_company(job.company),
        location=plain(job.location),
        program=_is_program(job.title) or bool(
            (job.source_type == "news" or job.source in {"RSS", "Google Alerts"})
            and re.search(r"(?<!\w)(estagio|internship)(?!\w)", plain(job.title))
            and identity.cycle
        ),
        tokens=frozenset(identity.tokens),
    )


def likely_same_context(left: DedupContext, right: DedupContext) -> tuple[bool, int, str]:
    left_identity = left.identity
    right_identity = right.identity
    if left_identity.key == right_identity.key:
        return True, min(left_identity.confidence, right_identity.confidence), left_identity.reasons[0]
    if left_identity.cycle and right_identity.cycle and left_identity.cycle != right_identity.cycle:
        return False, 0, "ciclos diferentes"
    if left.company and right.company and left.company != right.company:
        return False, 0, "empresas diferentes"
    company_tokens = set(identity_tokens(f"{left.company} {right.company}"))
    left_tokens = left.tokens - company_tokens
    right_tokens = right.tokens - company_tokens
    shared = left_tokens & right_tokens
    overlap = len(shared) / max(1, min(len(left_tokens), len(right_tokens)))
    distinctive = [token for token in shared if len(token) >= 3]
    programs = left.program and right.program
    same_program = programs and (
        overlap >= 0.6 or len(distinctive) >= 2
    )
    compatible_location = (
        not left.location
        or not right.location
        or left.location == right.location
        or left.location in right.location
        or right.location in left.location
    )
    same_role = not programs and bool(left.company and right.company) and compatible_location and overlap >= 0.85
    same = same_program or same_role
    confidence = max(88 if same_role else 80, round(overlap * 100)) if same else round(overlap * 100)
    reason = (
        "mesma empresa, função altamente semelhante e local compatível"
        if same_role
        else "programas com entidade e termos distintivos compatíveis"
    )
    return same, confidence, reason


def likely_same_opportunity(left_job: JobCandidate, right_job: JobCandidate) -> tuple[bool, int, str]:
    return likely_same_context(build_dedup_context(left_job), build_dedup_context(right_job))
