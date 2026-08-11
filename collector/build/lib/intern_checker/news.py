from __future__ import annotations

import re

from .models import JobCandidate
from .normalize import plain

GENERIC_COMPANY = re.compile(r"^(nao informada|unknown|rss|mastodon|telegram|google news(?: .*)?)$")
HEADLINE_COMPANY = re.compile(
    r"^(.{2,90}?)\s+(abre|abrem|lanca|lancam|oferece|oferecem|anuncia|anunciam|"
    r"inicia|iniciam|esta com|recebe|recebem|prorroga|prorrogam|contrata|contratam|"
    r"seleciona|selecionam)(?:\s|$)"
)


def useful_company(value: str | None) -> bool:
    normalized = plain(value or "")
    return len(normalized) >= 2 and not GENERIC_COMPANY.fullmatch(normalized)


def normalize_company(value: str) -> str:
    cleaned = " ".join(value.strip(" \t\n\r\"'“”|:").split())
    cleaned = re.sub(r"\s+20\d{2}(?:[.\/-]?[12])?\s*$", "", cleaned)
    return cleaned


def infer_news_company(title: str, current: str = "", publisher: str = "") -> str:
    if useful_company(current):
        return normalize_company(current)
    headline = re.split(r"\s+[|–—-]\s+(?=[^|–—-]{2,80}$)", title, maxsplit=1)[0]
    headline = re.sub(r"^inscri[cç][oõ]es abertas?\s*:\s*", "", headline, flags=re.IGNORECASE)
    match = HEADLINE_COMPANY.match(plain(headline))
    if not match:
        return current or "Não informada"
    # Recorta pelo comprimento da forma normalizada; para os nomes usuais isto preserva acentos e caixa.
    action = re.search(
        r"\s+(abre|abrem|lan[cç]a|lan[cç]am|oferece|oferecem|anuncia|anunciam|"
        r"inicia|iniciam|est[aá] com|recebe|recebem|prorroga|prorrogam|contrata|contratam|"
        r"seleciona|selecionam)(?:\s|$)",
        headline,
        re.IGNORECASE,
    )
    return normalize_company(headline[: action.start()] if action else match.group(1))


def normalize_news_candidate(job: JobCandidate) -> JobCandidate:
    if job.source_type != "news" and job.source not in {"RSS", "Google Alerts"}:
        return job
    publisher = str(
        job.raw_payload.get("publisher_name")
        or job.raw_payload.get("entry_source_title")
        or job.raw_payload.get("rss_publisher")
        or ""
    )
    job.company = infer_news_company(job.title, job.company, publisher)
    return job
