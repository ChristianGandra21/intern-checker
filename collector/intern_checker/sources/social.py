from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from urllib.parse import quote, urlencode

import aiohttp
from bs4 import BeautifulSoup
from dateutil import parser as date_parser

from ..http import random_headers
from ..models import JobCandidate

log = logging.getLogger(__name__)


def _parse_date(value: str | float | None) -> datetime | None:
    if value is None:
        return None
    try:
        if isinstance(value, int | float):
            return datetime.fromtimestamp(value, UTC)
        return date_parser.parse(value)
    except (TypeError, ValueError, OverflowError):
        return None


def _bsky_url(uri: str, handle: str) -> str:
    rkey = uri.rsplit("/", 1)[-1]
    return f"https://bsky.app/profile/{handle}/post/{rkey}"


async def _json_get(session: aiohttp.ClientSession, url: str, params: dict | None = None) -> dict | list:
    async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=30)) as response:
        response.raise_for_status()
        return await response.json()


async def _collect_bluesky_query(session: aiohttp.ClientSession, query: dict) -> list[JobCandidate]:
    data = await _json_get(
        session,
        "https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts",
        {"q": query["query"], "limit": int(query.get("limit", 100)), "sort": query.get("sort", "latest")},
    )
    jobs: list[JobCandidate] = []
    for item in data.get("posts", []):
        record = item.get("record", {})
        text = record.get("text", "")
        author = item.get("author", {})
        handle = author.get("handle", "")
        uri = item.get("uri", "")
        if not text or not handle or not uri:
            continue
        jobs.append(
            JobCandidate(
                title=text.splitlines()[0][:300],
                company=author.get("displayName") or handle,
                description=text,
                source="Bluesky",
                source_url=_bsky_url(uri, handle),
                published_at=_parse_date(record.get("createdAt") or item.get("indexedAt")),
            )
        )
    return jobs


async def _collect_reddit_query(session: aiohttp.ClientSession, query: dict) -> list[JobCandidate]:
    params = {
        "q": query["query"],
        "sort": query.get("sort", "new"),
        "t": query.get("time", "year"),
        "limit": int(query.get("limit", 100)),
        "restrict_sr": "on" if query.get("subreddit") else "off",
    }
    base = (
        f"https://www.reddit.com/r/{query['subreddit']}/search.json"
        if query.get("subreddit")
        else "https://www.reddit.com/search.json"
    )
    data = await _json_get(session, base, params)
    jobs: list[JobCandidate] = []
    for child in data.get("data", {}).get("children", []):
        post = child.get("data", {})
        title = post.get("title", "")
        permalink = post.get("permalink", "")
        if not title or not permalink:
            continue
        jobs.append(
            JobCandidate(
                title=title,
                company=f"r/{post.get('subreddit', 'reddit')}",
                description=post.get("selftext", ""),
                source="Reddit",
                source_url=f"https://www.reddit.com{permalink}",
                published_at=_parse_date(post.get("created_utc")),
            )
        )
    return jobs


async def _collect_hackernews_query(session: aiohttp.ClientSession, query: dict) -> list[JobCandidate]:
    data = await _json_get(
        session,
        "https://hn.algolia.com/api/v1/search_by_date",
        {
            "query": query["query"],
            "tags": query.get("tags", "(story,comment)"),
            "hitsPerPage": int(query.get("limit", 50)),
        },
    )
    jobs: list[JobCandidate] = []
    for hit in data.get("hits", []):
        title = hit.get("title") or hit.get("story_title") or hit.get("comment_text", "")
        url = hit.get("url") or f"https://news.ycombinator.com/item?id={hit.get('objectID')}"
        text = BeautifulSoup(hit.get("comment_text", "") or title, "html.parser").get_text(" ", strip=True)
        if not title or not url:
            continue
        jobs.append(
            JobCandidate(
                title=BeautifulSoup(title, "html.parser").get_text(" ", strip=True)[:300],
                company="Hacker News",
                description=text,
                source="Hacker News",
                source_url=url,
                published_at=_parse_date(hit.get("created_at")),
            )
        )
    return jobs


async def _collect_mastodon_tag(session: aiohttp.ClientSession, item: dict) -> list[JobCandidate]:
    instance = item.get("instance", "https://mastodon.social").rstrip("/")
    tag = quote(item["tag"].lstrip("#"))
    data = await _json_get(
        session,
        f"{instance}/api/v1/timelines/tag/{tag}",
        {"limit": int(item.get("limit", 40))},
    )
    jobs: list[JobCandidate] = []
    for status in data:
        content = BeautifulSoup(status.get("content", ""), "html.parser").get_text(" ", strip=True)
        account = status.get("account", {})
        if not content or not status.get("url"):
            continue
        jobs.append(
            JobCandidate(
                title=content.splitlines()[0][:300],
                company=account.get("display_name") or account.get("acct") or "Mastodon",
                description=content,
                source="Mastodon",
                source_url=status["url"],
                published_at=_parse_date(status.get("created_at")),
            )
        )
    return jobs


async def _collect_telegram_page(session: aiohttp.ClientSession, page: dict) -> list[JobCandidate]:
    channel = page["channel"].strip("@")
    url = f"https://t.me/s/{channel}"
    if page.get("query"):
        url = f"{url}?{urlencode({'q': page['query']})}"
    async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as response:
        response.raise_for_status()
        html = await response.text()
    soup = BeautifulSoup(html, "html.parser")
    jobs: list[JobCandidate] = []
    for message in soup.select(".tgme_widget_message")[: int(page.get("limit", 40))]:
        text_node = message.select_one(".tgme_widget_message_text")
        link_node = message.select_one(".tgme_widget_message_date")
        text = text_node.get_text(" ", strip=True) if text_node else ""
        href = link_node.get("href") if link_node else None
        if not text or not href:
            continue
        jobs.append(
            JobCandidate(
                title=text.splitlines()[0][:300],
                company=f"@{channel}",
                description=text,
                source="Telegram",
                source_url=href,
            )
        )
    return jobs


async def collect_social_sources(config: dict, concurrency: int = 6) -> list[JobCandidate]:
    semaphore = asyncio.Semaphore(concurrency)
    tasks = []
    async with aiohttp.ClientSession(headers=random_headers()) as session:
        for query in config.get("bluesky", []):
            tasks.append(("Bluesky", _collect_bluesky_query(session, query)))
        for query in config.get("reddit", []):
            tasks.append(("Reddit", _collect_reddit_query(session, query)))
        for query in config.get("hackernews", []):
            tasks.append(("Hacker News", _collect_hackernews_query(session, query)))
        for item in config.get("mastodon", []):
            tasks.append(("Mastodon", _collect_mastodon_tag(session, item)))
        for page in config.get("telegram", []):
            tasks.append(("Telegram", _collect_telegram_page(session, page)))

        async def guarded(name: str, task) -> list[JobCandidate]:
            async with semaphore:
                try:
                    return await task
                except Exception as exc:  # noqa: BLE001 - social sources are opportunistic
                    log.warning("Social source %s failed: %s", name, exc)
                    return []

        results = await asyncio.gather(*(guarded(name, task) for name, task in tasks))
    return [job for batch in results for job in batch]
