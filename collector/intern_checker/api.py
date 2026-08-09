from __future__ import annotations

import os

import aiohttp

from .models import JobCandidate

BATCH_SIZE = 30


def _chunks(items: list[JobCandidate], size: int = BATCH_SIZE):
    for index in range(0, len(items), size):
        yield items[index : index + size]


def _persistence_priority(job: JobCandidate) -> tuple[int, int]:
    # Registros mais confiáveis são enviados por último para vencer o upsert
    # entre lotes quando várias fontes representam a mesma vaga.
    source_priority = {
        "news": 0,
        "social": 0,
        "community": 1,
        "aggregator": 2,
        "official": 3,
    }.get(job.source_type, 0)
    return source_priority, len(job.description)


async def _post_batch(
    session: aiohttp.ClientSession,
    url: str,
    key: str,
    jobs: list[JobCandidate],
    run: dict | None = None,
) -> tuple[int, set[str]]:
    payload = {"candidates": [job.api_dict() for job in jobs]}
    if run is not None:
        payload["run"] = run
    async with session.post(
        url,
        json=payload,
        headers={"x-ingest-key": key},
        timeout=aiohttp.ClientTimeout(total=60),
    ) as response:
        data = await response.json()
        if response.status >= 400:
            raise RuntimeError(f"API returned {response.status}: {data}")
        return (
            int(data.get("persisted", data.get("upserted", 0))),
            {str(value) for value in data.get("newStrongSourceUrls", [])},
        )


async def send_to_api(jobs: list[JobCandidate], source_summary: dict[str, int]) -> tuple[int, set[str]]:
    url = os.getenv("JOBS_API_URL")
    key = os.getenv("INGEST_API_KEY")
    if not url or not key:
        return 0, set()
    snapshots: dict[tuple[str, str], list[str]] = {}
    for job in jobs:
        adapter = job.raw_payload.get("_adapter")
        identifier = job.raw_payload.get("_registry_identifier")
        if adapter and identifier and job.external_id:
            snapshots.setdefault((str(adapter), str(identifier)), []).append(job.external_id)
    run = {
        "found_count": sum(source_summary.values()),
        "source_summary": source_summary,
        "official_snapshots": [
            {"adapter": adapter, "identifier": identifier, "external_ids": external_ids}
            for (adapter, identifier), external_ids in snapshots.items()
        ],
    }
    pipeline_url = (
        f"{url.rstrip('/')[: -len('/api/jobs')]}/api/ingestion/candidates"
        if url.rstrip("/").endswith("/api/jobs")
        else f"{url.rstrip('/')}/ingestion/candidates"
    )
    upserted = 0
    new_strong_urls: set[str] = set()
    async with aiohttp.ClientSession() as session:
        batches = list(_chunks(sorted(jobs, key=_persistence_priority)))
        for index, batch in enumerate(batches):
            persisted, new_urls = await _post_batch(
                session, pipeline_url, key, batch, run if index == len(batches) - 1 else None
            )
            upserted += persisted
            new_strong_urls.update(new_urls)
    return upserted, new_strong_urls


async def fetch_registered_sources() -> list[dict]:
    url = os.getenv("JOBS_API_URL")
    key = os.getenv("INGEST_API_KEY")
    if not url or not key:
        return []
    registry_url = (
        f"{url.rstrip('/')[: -len('/api/jobs')]}/api/ingestion/sources"
        if url.rstrip("/").endswith("/api/jobs")
        else f"{url.rstrip('/')}/ingestion/sources"
    )
    try:
        async with (
            aiohttp.ClientSession() as session,
            session.get(
                registry_url,
                headers={"x-ingest-key": key},
                timeout=aiohttp.ClientTimeout(total=20),
            ) as response,
        ):
            if response.status >= 400:
                return []
            data = await response.json()
            return list(data.get("sources", []))
    except (aiohttp.ClientError, TimeoutError):
        return []


async def fetch_area_preferences() -> dict:
    url = os.getenv("JOBS_API_URL")
    key = os.getenv("INGEST_API_KEY")
    if not url or not key:
        return {"excluded_area_categories": [], "excluded_area_terms": []}
    root = url.rstrip("/").removesuffix("/api/jobs")
    try:
        async with (
            aiohttp.ClientSession() as session,
            session.get(
                f"{root}/api/ingestion/preferences",
                headers={"x-ingest-key": key},
                timeout=aiohttp.ClientTimeout(total=20),
            ) as response,
        ):
            return await response.json() if response.ok else {
                "excluded_area_categories": [],
                "excluded_area_terms": [],
            }
    except (aiohttp.ClientError, TimeoutError):
        return {"excluded_area_categories": [], "excluded_area_terms": []}
