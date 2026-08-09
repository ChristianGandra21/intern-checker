from __future__ import annotations

import asyncio
import logging
from urllib.parse import urlsplit

from ddgs import DDGS

from ..models import JobCandidate

log = logging.getLogger(__name__)


def _company_from_title(title: str) -> str:
    for separator in (" | ", " - ", " – ", " — ", " at ", " na ", " no "):
        if separator in title:
            pieces = title.split(separator)
            if len(pieces) > 1 and 1 < len(pieces[-1].strip()) < 80:
                return pieces[-1].strip()
    return "Não informada"


def _search(
    query: str,
    max_results: int,
    region: str = "br-pt",
    timelimit: str | None = "m",
    backend: str = "duckduckgo,brave,yandex",
    timeout: int = 8,
) -> list[dict]:
    return list(
        DDGS(timeout=timeout).text(
            query,
            region=region,
            safesearch="moderate",
            timelimit=timelimit,
            max_results=max_results,
            backend=backend,
        )
    )


async def _collect_query(
    item: dict, default_max_results: int, region: str, timelimit: str | None, backend: str, timeout: int
) -> list[JobCandidate]:
    query = item["query"]
    source = item.get("source", "Web")
    max_results = int(item.get("max_results", default_max_results))
    try:
        results = await asyncio.to_thread(
            _search,
            query,
            max_results,
            item.get("region", region),
            item.get("timelimit", timelimit),
            item.get("backend", backend),
            int(item.get("timeout", timeout)),
        )
    except Exception as exc:  # noqa: BLE001 - blocked search must not stop the daily run
        log.warning("Search source %s failed: %s", source, exc)
        return []

    jobs: list[JobCandidate] = []
    for result in results:
        href = result.get("href") or result.get("url")
        title = result.get("title", "")
        if not href or not title or urlsplit(href).scheme not in {"http", "https"}:
            continue
        jobs.append(
            JobCandidate(
                title=title,
                company=item.get("company", _company_from_title(title)),
                description=result.get("body", ""),
                location=item.get("location", ""),
                source=source,
                source_url=href,
            )
        )
    return jobs


async def collect_searches(
    queries: list[dict],
    max_results: int = 12,
    concurrency: int = 4,
    region: str = "br-pt",
    timelimit: str | None = "m",
    backend: str = "duckduckgo,brave,yandex",
    timeout: int = 8,
) -> list[JobCandidate]:
    semaphore = asyncio.Semaphore(concurrency)

    async def guarded(item: dict) -> list[JobCandidate]:
        async with semaphore:
            return await _collect_query(item, max_results, region, timelimit, backend, timeout)

    tasks = [asyncio.create_task(guarded(item)) for item in queries]
    results = []
    for completed, task in enumerate(asyncio.as_completed(tasks), start=1):
        results.append(await task)
        if completed % 5 == 0 or completed == len(tasks):
            log.info("Search progress: %d/%d queries", completed, len(tasks))
    return [job for batch in results for job in batch]
