from __future__ import annotations

import asyncio
import logging
from urllib.parse import urljoin, urlsplit

import aiohttp
from bs4 import BeautifulSoup

from ..http import get_text_with_retry, random_headers
from ..models import JobCandidate
from ..normalize import plain

log = logging.getLogger(__name__)

DEFAULT_INCLUDE_TERMS = (
    "estagio",
    "estagiario",
    "estagiaria",
    "programa de estagio",
    "programa estagio",
    "internship",
    "2027",
)


def _valid_url(value: str) -> bool:
    return urlsplit(value).scheme in {"http", "https"}


def _looks_relevant(text: str, include_terms: tuple[str, ...]) -> bool:
    normalized = plain(text)
    return any(term in normalized for term in include_terms)


def _context_text(link) -> str:
    parent = link.find_parent(["article", "li", "section", "div"])
    text = parent.get_text(" ", strip=True) if parent else link.get_text(" ", strip=True)
    return " ".join(text.split())


async def _fetch_text(session: aiohttp.ClientSession, url: str) -> str:
    return await get_text_with_retry(session, url, timeout=25)


async def _collect_page(session: aiohttp.ClientSession, page: dict) -> list[JobCandidate]:
    url = page["url"]
    html = await _fetch_text(session, url)
    soup = BeautifulSoup(html, "html.parser")
    include_terms = tuple(plain(term) for term in page.get("include_terms", DEFAULT_INCLUDE_TERMS))
    source = page.get("source", "Public Page")
    company = page.get("company", page.get("name", "Não informada"))
    location = page.get("location", "")
    limit = int(page.get("limit", 120))
    jobs: list[JobCandidate] = []

    for link in soup.select(page.get("link_selector", "a[href]")):
        href = link.get("href")
        title = link.get_text(" ", strip=True)
        absolute_url = urljoin(url, href or "")
        context = _context_text(link)
        candidate_text = f"{title} {context} {absolute_url}"
        if not href or not title or not _valid_url(absolute_url):
            continue
        if not _looks_relevant(candidate_text, include_terms):
            continue
        jobs.append(
            JobCandidate(
                title=title[:300],
                company=company,
                description=page.get("description", context or candidate_text),
                location=location,
                source=source,
                source_url=absolute_url,
            )
        )
        if len(jobs) >= limit:
            break
    return jobs


async def collect_public_pages(pages: list[dict], concurrency: int = 5) -> list[JobCandidate]:
    if not pages:
        return []
    semaphore = asyncio.Semaphore(concurrency)
    async with aiohttp.ClientSession(headers=random_headers()) as session:

        async def guarded(page: dict) -> list[JobCandidate]:
            async with semaphore:
                try:
                    return await _collect_page(session, page)
                except Exception as exc:  # noqa: BLE001 - source failures should not stop the run
                    log.warning("Public page %s failed: %s", page.get("name", page.get("url")), exc)
                    return []

        results = await asyncio.gather(*(guarded(page) for page in pages))
    return [job for batch in results for job in batch]
