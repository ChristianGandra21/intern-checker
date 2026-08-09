from __future__ import annotations

import asyncio
import logging

import feedparser
from bs4 import BeautifulSoup
from dateutil import parser as date_parser

from ..models import JobCandidate

log = logging.getLogger(__name__)


def _parse_feed(feed: dict) -> list[JobCandidate]:
    parsed = feedparser.parse(feed["url"])
    jobs: list[JobCandidate] = []
    for entry in parsed.entries[: feed.get("limit", 30)]:
        link = entry.get("link")
        title = entry.get("title", "")
        if not link or not title:
            continue
        summary = BeautifulSoup(entry.get("summary", ""), "html.parser").get_text(" ", strip=True)
        published = entry.get("published") or entry.get("updated")
        try:
            published_at = date_parser.parse(published) if published else None
        except (ValueError, TypeError):
            published_at = None
        jobs.append(
            JobCandidate(
                title=title,
                company=feed.get("company", feed.get("name", "Não informada")),
                description=summary,
                location=feed.get("location", ""),
                source=feed.get("source", "RSS"),
                source_url=link,
                published_at=published_at,
                source_type="news",
                raw_payload={
                    "feed_name": feed.get("name", "RSS"),
                    "feed_url": feed.get("url", ""),
                    "entry_id": entry.get("id", link),
                    "rss_summary": summary,
                },
            )
        )
    return jobs


async def collect_feeds(feeds: list[dict]) -> list[JobCandidate]:
    results = await asyncio.gather(
        *(asyncio.to_thread(_parse_feed, feed) for feed in feeds), return_exceptions=True
    )
    jobs: list[JobCandidate] = []
    for feed, result in zip(feeds, results, strict=True):
        if isinstance(result, BaseException):
            log.warning("RSS source %s failed: %s", feed.get("name", feed.get("url")), result)
        else:
            jobs.extend(result)
    return jobs
