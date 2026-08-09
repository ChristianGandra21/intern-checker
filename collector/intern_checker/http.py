from __future__ import annotations

import asyncio
import random

import aiohttp

USER_AGENTS = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
)


def random_headers() -> dict[str, str]:
    return {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    }


async def get_text_with_retry(
    session: aiohttp.ClientSession,
    url: str,
    *,
    retries: int = 2,
    timeout: int = 30,
) -> str:
    last_error: BaseException | None = None
    for attempt in range(retries + 1):
        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=timeout)) as response:
                response.raise_for_status()
                return await response.text()
        except Exception as exc:  # noqa: BLE001 - callers log source-level failures
            last_error = exc
            if attempt < retries:
                await asyncio.sleep((2**attempt) + random.random())
    raise RuntimeError(f"GET failed after {retries + 1} attempts: {last_error}")
