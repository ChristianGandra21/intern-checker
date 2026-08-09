from __future__ import annotations

import asyncio
import logging
from html import unescape

import aiohttp
from bs4 import BeautifulSoup

from ..http import random_headers
from ..models import JobCandidate

log = logging.getLogger(__name__)


def _text(value: str | None) -> str:
    return BeautifulSoup(unescape(value or ""), "html.parser").get_text(" ", strip=True)


async def _get_json(session: aiohttp.ClientSession, url: str) -> dict | list:
    async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as response:
        response.raise_for_status()
        return await response.json(content_type=None)


async def _greenhouse(session: aiohttp.ClientSession, source: dict) -> list[JobCandidate]:
    token = source["identifier"]
    data = await _get_json(session, f"https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true")
    return [
        JobCandidate(
            title=item["title"],
            company=source.get("company", token),
            description=_text(item.get("content")),
            location=(item.get("location") or {}).get("name", ""),
            source="Greenhouse",
            source_type="official",
            external_id=str(item["id"]),
            source_url=item["absolute_url"],
            official_url=item["absolute_url"],
            application_url=item["absolute_url"],
            raw_payload={**item, "_adapter": "greenhouse", "_registry_identifier": token},
            published_at=item.get("updated_at"),
        )
        for item in data.get("jobs", [])
    ]


async def _lever(session: aiohttp.ClientSession, source: dict) -> list[JobCandidate]:
    site = source["identifier"]
    data = await _get_json(session, f"https://api.lever.co/v0/postings/{site}?mode=json")
    return [
        JobCandidate(
            title=item["text"],
            company=source.get("company", site),
            description=item.get("descriptionPlain") or _text(item.get("description")),
            location=(item.get("categories") or {}).get("location", ""),
            work_mode={"remote": "remote", "hybrid": "hybrid", "on-site": "onsite"}.get(
                item.get("workplaceType"), "unknown"
            ),
            source="Lever",
            source_type="official",
            external_id=item["id"],
            source_url=item["hostedUrl"],
            official_url=item["hostedUrl"],
            application_url=item.get("applyUrl") or item["hostedUrl"],
            raw_payload={**item, "_adapter": "lever", "_registry_identifier": site},
        )
        for item in data
    ]


async def _ashby(session: aiohttp.ClientSession, source: dict) -> list[JobCandidate]:
    board = source["identifier"]
    data = await _get_json(session, f"https://api.ashbyhq.com/posting-api/job-board/{board}")
    return [
        JobCandidate(
            title=item["title"],
            company=source.get("company", board),
            description=item.get("descriptionPlain", ""),
            location=item.get("location", ""),
            work_mode="remote" if item.get("isRemote") else "unknown",
            source="Ashby",
            source_type="official",
            external_id=item.get("id"),
            source_url=item["jobUrl"],
            official_url=item["jobUrl"],
            application_url=item.get("applyUrl") or item["jobUrl"],
            raw_payload={**item, "_adapter": "ashby", "_registry_identifier": board},
            published_at=item.get("publishedAt"),
        )
        for item in data.get("jobs", [])
    ]


ADAPTERS = {"greenhouse": _greenhouse, "lever": _lever, "ashby": _ashby}


async def collect_ats_sources(sources: list[dict], concurrency: int = 4) -> list[JobCandidate]:
    if not sources:
        return []
    semaphore = asyncio.Semaphore(concurrency)
    async with aiohttp.ClientSession(headers=random_headers()) as session:

        async def guarded(source: dict) -> list[JobCandidate]:
            async with semaphore:
                try:
                    return await ADAPTERS[source["adapter"]](session, source)
                except Exception as exc:  # noqa: BLE001
                    log.warning("ATS %s failed: %s", source.get("name", source.get("identifier")), exc)
                    return []

        batches = await asyncio.gather(
            *(guarded(source) for source in sources if source.get("enabled", True))
        )
    return [job for batch in batches for job in batch]
