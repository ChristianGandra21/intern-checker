from __future__ import annotations

import asyncio
import logging
import os
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup

from ..models import JobCandidate
from ..prefilter import is_individual_job_url

log = logging.getLogger(__name__)


def _valid_url(value: str) -> bool:
    return urlsplit(value).scheme in {"http", "https"}


def _browser_launch_options() -> dict:
    options = {"headless": True}
    if channel := os.getenv("PLAYWRIGHT_BROWSER_CHANNEL", "").strip():
        options["channel"] = channel
    return options


async def _collect_rendered_page(page_config: dict) -> list[JobCandidate]:
    if page_config.get("enabled", True) is False:
        return []
    try:
        from playwright.async_api import async_playwright
    except ImportError as exc:
        raise RuntimeError("Playwright não instalado. Rode: pip install -e './collector[dynamic]'") from exc

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(**_browser_launch_options())
        page = await browser.new_page()
        await page.goto(
            page_config["url"],
            wait_until="domcontentloaded",
            timeout=int(page_config.get("timeout_seconds", 25)) * 1000,
        )
        await page.wait_for_timeout(int(page_config.get("settle_ms", 1500)))
        html = await page.content()
        await browser.close()

    soup = BeautifulSoup(html, "html.parser")
    jobs: list[JobCandidate] = []
    for item in soup.select(page_config.get("item_selector", "a[href]"))[
        : int(page_config.get("limit", 100))
    ]:
        title_node = (
            item.select_one(page_config["title_selector"]) if page_config.get("title_selector") else item
        )
        link_node = (
            item.select_one(page_config["link_selector"]) if page_config.get("link_selector") else item
        )
        description_node = (
            item.select_one(page_config["description_selector"])
            if page_config.get("description_selector")
            else item
        )
        title = title_node.get_text(" ", strip=True) if title_node else ""
        href = link_node.get("href") if link_node else None
        url = urljoin(page_config["url"], href or "")
        if not title or not href or not _valid_url(url):
            continue
        if not is_individual_job_url(url, page_config.get("source", "")):
            continue
        jobs.append(
            JobCandidate(
                title=title[:300],
                company=page_config.get("company", "Não informada"),
                description=description_node.get_text(" ", strip=True) if description_node else "",
                location=page_config.get("location", ""),
                source=page_config.get("source", "Rendered Page"),
                source_url=url,
            )
        )
    return jobs


async def collect_rendered_pages(pages: list[dict], concurrency: int = 2) -> list[JobCandidate]:
    if not pages:
        return []
    semaphore = asyncio.Semaphore(concurrency)

    async def guarded(page: dict) -> list[JobCandidate]:
        async with semaphore:
            try:
                return await _collect_rendered_page(page)
            except Exception as exc:  # noqa: BLE001 - rendered sources are optional
                log.warning("Rendered page %s failed: %s", page.get("name", page.get("url")), exc)
                return []

    results = await asyncio.gather(*(guarded(page) for page in pages))
    return [job for batch in results for job in batch]
