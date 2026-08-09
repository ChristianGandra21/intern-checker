from __future__ import annotations

import asyncio
import logging
from urllib.parse import urljoin

import aiohttp
from bs4 import BeautifulSoup

from ..http import get_text_with_retry, random_headers
from ..models import JobCandidate

log = logging.getLogger(__name__)


async def _collect_page(session: aiohttp.ClientSession, company: dict) -> list[JobCandidate]:
    html = await get_text_with_retry(session, company["url"], timeout=25)
    soup = BeautifulSoup(html, "html.parser")
    selector = company.get("item_selector", "a")
    title_selector = company.get("title_selector")
    description_selector = company.get("description_selector")
    link_selector = company.get("link_selector")
    jobs: list[JobCandidate] = []
    for item in soup.select(selector)[: company.get("limit", 100)]:
        title_node = item.select_one(title_selector) if title_selector else item
        link_node = (
            item.select_one(link_selector)
            if link_selector
            else (item if item.name == "a" else item.select_one("a"))
        )
        description_node = item.select_one(description_selector) if description_selector else item
        title = title_node.get_text(" ", strip=True) if title_node else ""
        href = link_node.get("href") if link_node else None
        if not title or not href:
            continue
        jobs.append(
            JobCandidate(
                title=title,
                company=company["name"],
                description=description_node.get_text(" ", strip=True) if description_node else "",
                location=company.get("location", ""),
                source="Careers",
                source_url=urljoin(company["url"], href),
            )
        )
    return jobs


async def collect_career_pages(companies: list[dict]) -> list[JobCandidate]:
    if not companies:
        return []
    async with aiohttp.ClientSession(headers=random_headers()) as session:
        results = await asyncio.gather(
            *(_collect_page(session, company) for company in companies), return_exceptions=True
        )
    jobs: list[JobCandidate] = []
    for company, result in zip(companies, results, strict=True):
        if isinstance(result, BaseException):
            log.warning("Career page %s failed: %s", company.get("name"), result)
        else:
            jobs.extend(result)
    return jobs
