from __future__ import annotations

import hashlib
import re
import unicodedata
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from .identity import build_dedup_identity
from .models import JobCandidate

TRACKING_PARAMS = {
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "trk",
    "ref",
    "refid",
}


def plain(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    return " ".join("".join(char for char in normalized if not unicodedata.combining(char)).lower().split())


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def canonical_url(value: str) -> str:
    parts = urlsplit(value)
    query = urlencode(
        [(key, val) for key, val in parse_qsl(parts.query) if key.lower() not in TRACKING_PARAMS]
    )
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path.rstrip("/"), query, ""))


def infer_work_mode(text: str) -> str:
    value = plain(text)
    if any(term in value for term in ("remoto", "remote", "home office", "anywhere")):
        return "remote"
    if any(term in value for term in ("hibrido", "hybrid", "2x por semana", "3x por semana")):
        return "hybrid"
    if any(term in value for term in ("presencial", "onsite", "on-site")):
        return "onsite"
    return "unknown"


def fingerprint(job: JobCandidate) -> str:
    identity = "|".join((plain(job.title), plain(job.company), plain(job.location)))
    return hashlib.sha256(identity.encode()).hexdigest()


def normalize_job(job: JobCandidate) -> JobCandidate:
    title = clean_text(job.title)
    company = clean_text(job.company) or "Não informada"
    description = clean_text(job.description)
    location = clean_text(job.location)
    work_mode = job.work_mode
    if work_mode == "unknown":
        work_mode = infer_work_mode(f"{title} {location} {description}")  # type: ignore[assignment]

    data = job.model_dump(mode="python")
    data.update(
        {
            "title": title,
            "company": company,
            "description": description,
            "location": location,
            "source_url": canonical_url(str(job.source_url)),
            "work_mode": work_mode,
        }
    )
    normalized = JobCandidate(**data)
    normalized.fingerprint = fingerprint(normalized)
    identity = build_dedup_identity(normalized)
    normalized.dedup_group_key = identity.key
    normalized.dedup_confidence = identity.confidence
    normalized.dedup_reasons = identity.reasons
    return normalized
