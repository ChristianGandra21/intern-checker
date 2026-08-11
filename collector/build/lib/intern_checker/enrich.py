from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import UTC, datetime
from urllib.parse import urljoin, urlsplit

import aiohttp
from bs4 import BeautifulSoup
from dateutil import parser as date_parser
from ddgs import DDGS

from .http import random_headers
from .models import JobCandidate
from .news import normalize_news_candidate
from .normalize import canonical_url

log = logging.getLogger(__name__)
ATS_HOSTS = (
    "greenhouse.io",
    "lever.co",
    "ashbyhq.com",
    "gupy.io",
    "myworkdayjobs.com",
    "solides.com.br",
)
JOB_PORTAL_HOSTS = ("vagas.com.br", "nube.com.br", "ciee.org.br", "99jobs.com")
BLOCKED_SOCIAL_HOSTS = ("linkedin.com", "x.com", "twitter.com")
GOOGLE_NEWS_HOSTS = ("news.google.com",)
APPLICATION_TEXT = re.compile(
    r"\b(candidate-se|candidatar|candidatura|inscreva-se|inscri[cç][aã]o|apply|application|ver vaga)\b",
    re.IGNORECASE,
)
PROGRAM_LANDING = re.compile(
    r"\b(programa\s+(?:de\s+)?est[aá]gio|internship\s+program|est[aá]gio\s+20\d{2})\b",
    re.IGNORECASE,
)
OPEN_PROGRAM = re.compile(
    r"\b(inscri[cç][oõ]es?\s+abertas?|inscreva-se|candidate-se|candidatar|quero\s+(?:me\s+)?(?:inscrever|participar)|apply)\b",
    re.IGNORECASE,
)
JOB_PATH = re.compile(
    r"/(job|jobs|vaga|vagas|oportunidade|position|career|carreira)(/|[-_])", re.IGNORECASE
)


def _updated(job: JobCandidate, **changes) -> JobCandidate:
    data = job.model_dump(mode="python")
    data.update(changes)
    return JobCandidate(**data)


def _jsonld_items(soup: BeautifulSoup) -> list[dict]:
    items: list[dict] = []
    for node in soup.select('script[type="application/ld+json"]'):
        try:
            value = json.loads(node.string or "{}")
        except (json.JSONDecodeError, TypeError):
            continue
        values = value if isinstance(value, list) else [value]
        for entry in values:
            if not isinstance(entry, dict):
                continue
            graph = entry.get("@graph")
            items.extend(item for item in graph if isinstance(item, dict)) if isinstance(graph, list) else None
            items.append(entry)
    return items


def _has_type(item: dict, expected: str) -> bool:
    value = item.get("@type")
    return expected in value if isinstance(value, list) else value == expected


def _jsonld_job(soup: BeautifulSoup) -> dict | None:
    return next((item for item in _jsonld_items(soup) if _has_type(item, "JobPosting")), None)


def _jsonld_news(soup: BeautifulSoup) -> dict | None:
    news_types = {"NewsArticle", "Article", "ReportageNewsArticle"}
    return next(
        (item for item in _jsonld_items(soup) if any(_has_type(item, name) for name in news_types)),
        None,
    )


def _location(data: dict) -> str:
    locations = data.get("jobLocation") or []
    if isinstance(locations, dict):
        locations = [locations]
    values = []
    for item in locations:
        address = item.get("address", {}) if isinstance(item, dict) else {}
        values.append(
            ", ".join(
                str(address.get(key, ""))
                for key in ("addressLocality", "addressRegion", "addressCountry")
                if address.get(key)
            )
        )
    return "; ".join(filter(None, values))


def _host_matches(host: str, domains: tuple[str, ...]) -> bool:
    host = host.lower()
    return any(host == domain or host.endswith(f".{domain}") for domain in domains)


def _is_blocked_social(value: str) -> bool:
    return _host_matches(urlsplit(value).hostname or "", BLOCKED_SOCIAL_HOSTS)


def _is_listing_path(value: str) -> bool:
    path = urlsplit(value).path.rstrip("/").lower()
    return path in {"", "/jobs", "/vagas", "/careers", "/carreiras", "/estudantes"} or "job-search" in path


def _link_score(value: str, anchor_text: str = "") -> int:
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or _is_blocked_social(value):
        return -1
    host = parsed.hostname or ""
    score = 0
    if _host_matches(host, ATS_HOSTS):
        score = 100
    elif _host_matches(host, JOB_PORTAL_HOSTS):
        score = 80
    elif JOB_PATH.search(parsed.path):
        score = 60
    if APPLICATION_TEXT.search(anchor_text):
        score += 20
    if _is_listing_path(value):
        score -= 70
    return score


def _application_link(soup: BeautifulSoup, base_url: str) -> str | None:
    ranked: list[tuple[int, str]] = []
    for node in soup.select("a[href]"):
        value = urljoin(base_url, node.get("href", ""))
        score = _link_score(value, node.get_text(" ", strip=True))
        if score >= 50:
            ranked.append((score, value))
    return max(ranked, default=(0, ""), key=lambda item: item[0])[1] or None


def _publisher_link(soup: BeautifulSoup, base_url: str) -> str | None:
    base_host = urlsplit(base_url).hostname or ""
    candidates: list[str] = []
    for node in soup.select("a[href]"):
        value = urljoin(base_url, node.get("href", ""))
        parsed = urlsplit(value)
        host = parsed.hostname or ""
        if (
            parsed.scheme in {"http", "https"}
            and host
            and host != base_host
            and not _host_matches(host, ("google.com", "google.com.br", *BLOCKED_SOCIAL_HOSTS))
        ):
            candidates.append(value)
    return candidates[0] if candidates else None


def _article_text(soup: BeautifulSoup) -> str:
    root = soup.select_one("article") or soup.select_one("main") or soup.body
    if not root:
        return ""
    for node in root.select("script,style,nav,header,footer,aside,form"):
        node.decompose()
    return " ".join(root.get_text(" ", strip=True).split())[:12_000]


def _page_title(soup: BeautifulSoup, fallback: str) -> str:
    node = soup.select_one("h1") or soup.select_one('meta[property="og:title"]') or soup.title
    if not node:
        return fallback
    value = node.get("content") if node.name == "meta" else node.get_text(" ", strip=True)
    return " ".join(str(value or fallback).split())[:300]


def _is_program_landing(job: JobCandidate, soup: BeautifulSoup, final_url: str, text: str) -> bool:
    path = urlsplit(final_url).path.rstrip("/").lower()
    explicit_listing = path in {"/jobs", "/vagas", "/careers", "/carreiras", "/estudantes"} or "job-search" in path
    if job.source_type in {"news", "social"} or explicit_listing:
        return False
    title = _page_title(soup, job.title)
    return bool(PROGRAM_LANDING.search(f"{title} {text}") and OPEN_PROGRAM.search(text))


def _published_date(data: dict | None) -> datetime | None:
    value = (data or {}).get("datePublished") or (data or {}).get("dateModified")
    if not value:
        return None
    try:
        parsed = date_parser.parse(str(value))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    except (TypeError, ValueError):
        return None


def _news_publisher(data: dict | None) -> str:
    publisher = (data or {}).get("publisher") or {}
    if isinstance(publisher, dict):
        return str(publisher.get("name") or "")
    return str(publisher or "")


def _deadline(data: dict) -> datetime | None:
    value = data.get("validThrough")
    if not value:
        return None
    try:
        parsed = date_parser.parse(str(value))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    except (TypeError, ValueError):
        return None


async def _fetch_page(
    session: aiohttp.ClientSession, value: str
) -> tuple[int, str, str]:
    async with session.get(
        value,
        allow_redirects=True,
        timeout=aiohttp.ClientTimeout(total=20),
    ) as response:
        text = await response.text(errors="ignore") if response.status < 500 else ""
        return response.status, str(response.url), text[:1_500_000]


def _apply_jobposting(job: JobCandidate, data: dict, final_url: str) -> JobCandidate:
    job.raw_payload["jsonld"] = data
    identifier = data.get("identifier") or {}
    external_id = identifier.get("value") if isinstance(identifier, dict) else identifier
    organization = data.get("hiringOrganization") or {}
    company = organization.get("name") if isinstance(organization, dict) else ""
    return _updated(
        job,
        title=str(data.get("title") or job.title)[:300],
        company=company or job.company,
        description=BeautifulSoup(
            str(data.get("description") or job.description), "html.parser"
        ).get_text(" ", strip=True),
        location=_location(data) or job.location,
        external_id=str(external_id or job.external_id or "") or None,
        application_deadline=_deadline(data) or job.application_deadline,
        official_url=final_url,
        application_url=final_url,
        source_type="official",
    )


def _search_official_sync(job: JobCandidate) -> str | None:
    query = (
        f'"{job.company[:80]}" "{job.title[:140]}" '
        "(site:gupy.io OR site:jobs.lever.co OR site:greenhouse.io OR "
        "site:jobs.ashbyhq.com OR site:myworkdayjobs.com OR site:vagas.com.br)"
    )
    try:
        results = DDGS(timeout=5).text(
            query,
            region="br-pt",
            safesearch="moderate",
            timelimit="m",
            max_results=3,
            backend="yandex",
        )
        ranked = []
        for result in results:
            value = str(result.get("href") or result.get("url") or "")
            score = _link_score(value, str(result.get("title") or ""))
            if score >= 50:
                ranked.append((score, value))
        return max(ranked, default=(0, ""), key=lambda item: item[0])[1] or None
    except Exception as exc:  # noqa: BLE001 - search blocks are isolated per lead
        log.debug("Public resolution failed for %s: %s", job.title, exc)
        return None


async def _follow_official(
    session: aiohttp.ClientSession, job: JobCandidate, official: str
) -> JobCandidate:
    job = _updated(job, official_url=official, application_url=official)
    status, final_url, html = await _fetch_page(session, official)
    job.raw_payload["official_http_status"] = status
    job.raw_payload["official_resolved_url"] = final_url
    if status in {404, 410}:
        return _updated(job, official_url=None, application_url=None)
    if status >= 400:
        return job
    soup = BeautifulSoup(html, "html.parser")
    if _host_matches(urlsplit(final_url).hostname or "", GOOGLE_NEWS_HOSTS):
        publisher = _publisher_link(soup, final_url)
        if publisher:
            publisher_status, publisher_url, publisher_html = await _fetch_page(session, publisher)
            job.raw_payload["publisher_url"] = publisher_url
            job.raw_payload["publisher_http_status"] = publisher_status
            if publisher_status < 400:
                final_url, html = publisher_url, publisher_html
                soup = BeautifulSoup(html, "html.parser")
    data = _jsonld_job(soup)
    if data:
        return _apply_jobposting(job, data, final_url)
    official_text = _article_text(soup)
    if len(official_text) > len(job.description):
        job = _updated(job, description=official_text)
    return _updated(job, official_url=final_url, application_url=final_url)


async def _enrich_one(session: aiohttp.ClientSession, job: JobCandidate) -> JobCandidate:
    source_url = str(job.source_url)
    if _is_blocked_social(source_url):
        job.raw_payload["direct_access_skipped"] = "social URL requiring login"
        if job.source == "Planilha comunitária":
            official = await asyncio.to_thread(_search_official_sync, job)
            if official:
                job.raw_payload["resolved_by"] = "public_search"
                return await _follow_official(session, job, official)
        return job

    status, final_url, html = await _fetch_page(session, source_url)
    job.raw_payload["http_status"] = status
    job.raw_payload["resolved_url"] = final_url
    if status in {404, 410} or status >= 400:
        return job

    soup = BeautifulSoup(html, "html.parser")
    data = _jsonld_job(soup)
    if data:
        return _apply_jobposting(job, data, final_url)

    if (
        job.source == "Planilha comunitária"
        and job.raw_payload.get("link_kind") == "official"
        and not _is_listing_path(final_url)
    ):
        job = _updated(job, official_url=final_url, application_url=final_url)

    if job.source_type == "news":
        article = _jsonld_news(soup)
        if article:
            job.raw_payload["news_jsonld"] = article
            publisher_name = _news_publisher(article)
            if publisher_name:
                job.raw_payload["publisher_name"] = publisher_name
        text = _article_text(soup)
        if text:
            job = _updated(job, description=text)
        published = _published_date(article)
        if published:
            job = _updated(job, published_at=published)
        job = normalize_news_candidate(job)

    page_text = _article_text(soup)
    if job.source_type != "news" and len(page_text) > len(job.description):
        job = _updated(job, title=_page_title(soup, job.title), description=page_text)

    official = _application_link(soup, final_url)
    if official and canonical_url(official) != canonical_url(final_url):
        return await _follow_official(session, job, official)
    if _is_program_landing(job, soup, final_url, page_text):
        job.raw_payload["resolved_as"] = "official_program_landing"
        return _updated(job, official_url=final_url, source_type="official")
    return job


def _merge_enrichment(original: JobCandidate, enriched: JobCandidate) -> JobCandidate:
    original_data = original.model_dump(mode="python")
    enriched_data = enriched.model_dump(mode="python")
    for field in (
        "title",
        "company",
        "description",
        "location",
        "work_mode",
        "external_id",
        "official_url",
        "application_url",
        "published_at",
        "application_deadline",
    ):
        value = enriched_data.get(field)
        if value not in (None, "", "unknown"):
            original_data[field] = value
    original_data["source_type"] = enriched.source_type
    original_data["raw_payload"] = {**original.raw_payload, **enriched.raw_payload}
    return JobCandidate(**original_data)


async def enrich_candidates(
    jobs: list[JobCandidate], concurrency: int = 10, limit: int = 400, timeout_seconds: int = 20
) -> list[JobCandidate]:
    # Uma URL é acessada no máximo uma vez; todas as origens continuam no payload.
    representatives: dict[str, JobCandidate] = {}
    for job in jobs:
        representatives.setdefault(canonical_url(str(job.source_url)), job)
    buckets: dict[str, list[tuple[str, JobCandidate]]] = {
        "official": [], "program": [], "community": [], "news": [], "other": []
    }
    for item in representatives.items():
        job = item[1]
        bucket = (
            "official" if job.source_type == "official"
            else "program" if PROGRAM_LANDING.search(f"{job.title} {job.description}")
            else "community" if job.source_type == "community"
            else "news" if job.source_type == "news"
            else "other"
        )
        buckets[bucket].append(item)
    selected: list[tuple[str, JobCandidate]] = []
    weighted_order = ["official"] * 5 + ["program"] * 4 + ["community"] * 2 + ["news"] * 2 + ["other"]
    offsets = {name: 0 for name in buckets}
    while len(selected) < limit and any(offsets[name] < len(values) for name, values in buckets.items()):
        progressed = False
        for name in weighted_order:
            if len(selected) >= limit:
                break
            offset = offsets[name]
            if offset < len(buckets[name]):
                selected.append(buckets[name][offset])
                offsets[name] += 1
                progressed = True
        if not progressed:
            break
    semaphore = asyncio.Semaphore(concurrency)
    async with aiohttp.ClientSession(headers=random_headers()) as session:

        async def guarded(key: str, job: JobCandidate) -> tuple[str, JobCandidate]:
            if job.source_type == "official" and len(job.description) >= 300:
                return key, job
            async with semaphore:
                try:
                    async with asyncio.timeout(timeout_seconds):
                        return key, await _enrich_one(session, job)
                except Exception as exc:  # noqa: BLE001
                    log.debug("Enrichment failed for %s: %s", job.source_url, exc)
                    return key, job

        tasks = [asyncio.create_task(guarded(key, job)) for key, job in selected]
        by_url = {}
        for completed, task in enumerate(asyncio.as_completed(tasks), start=1):
            key, enriched = await task
            by_url[key] = enriched
            if completed % 25 == 0 or completed == len(tasks):
                log.info("Enrichment progress: %d/%d URLs", completed, len(tasks))
    return [
        _merge_enrichment(job, by_url[key]) if (key := canonical_url(str(job.source_url))) in by_url else job
        for job in jobs
    ]
