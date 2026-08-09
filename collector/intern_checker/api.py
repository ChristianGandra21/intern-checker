from __future__ import annotations

import os
from collections import defaultdict
from dataclasses import dataclass, field

import aiohttp

from .models import JobCandidate

BATCH_SIZE = 40


@dataclass
class IngestionResult:
    persisted: int = 0
    new_strong_urls: set[str] = field(default_factory=set)
    outcomes: dict[str, dict] = field(default_factory=dict)
    totals: dict[str, int] = field(default_factory=dict)
    run_id: str | None = None


def _pipeline_root(url: str) -> str:
    return url.rstrip("/").removesuffix("/api/jobs").removesuffix("/api")


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
    run_id: str,
) -> dict:
    payload = {"candidates": [job.api_dict() for job in jobs], "run_id": run_id}
    async with session.post(
        url,
        json=payload,
        headers={"x-ingest-key": key},
        timeout=aiohttp.ClientTimeout(total=60),
    ) as response:
        data = await response.json()
        if response.status >= 400:
            raise RuntimeError(f"API returned {response.status}: {data}")
        return data


async def send_to_api(
    jobs: list[JobCandidate],
    source_summary: dict[str, int],
    source_durations: dict[str, int] | None = None,
) -> IngestionResult:
    url = os.getenv("JOBS_API_URL")
    key = os.getenv("INGEST_API_KEY")
    if not url or not key:
        return IngestionResult()
    snapshots: dict[tuple[str, str], list[str]] = {}
    for job in jobs:
        adapter = job.raw_payload.get("_adapter")
        identifier = job.raw_payload.get("_registry_identifier")
        if adapter and identifier and job.external_id:
            snapshots.setdefault((str(adapter), str(identifier)), []).append(job.external_id)
    run_payload = {
        "found_count": sum(source_summary.values()),
        "source_summary": source_summary,
        "official_snapshots": [
            {"adapter": adapter, "identifier": identifier, "external_ids": external_ids}
            for (adapter, identifier), external_ids in snapshots.items()
        ],
    }
    root = _pipeline_root(url)
    pipeline_url = f"{root}/api/ingestion/candidates"
    runs_url = f"{root}/api/ingestion/runs"
    result = IngestionResult(totals={key: 0 for key in ("accepted", "review", "rejected", "hidden", "resolved", "failures")})
    source_totals: dict[str, dict[str, int | str]] = defaultdict(
        lambda: {key: 0 for key in ("discovered", "resolved", "persisted", "accepted", "review", "rejected", "hidden", "failures")}
    )
    for source, discovered in source_summary.items():
        source_totals[source]["discovered"] = discovered
        source_totals[source]["duration_ms"] = (source_durations or {}).get(source, 0)
    for source, duration in (source_durations or {}).items():
        source_totals[source]["duration_ms"] = duration
    source_by_url = {str(job.source_url): job.source for job in jobs}
    async with aiohttp.ClientSession() as session:
        async with session.post(
            runs_url,
            json={"found_count": run_payload["found_count"], "source_summary": source_summary},
            headers={"x-ingest-key": key},
            timeout=aiohttp.ClientTimeout(total=30),
        ) as response:
            opened = await response.json()
            if response.status >= 400:
                raise RuntimeError(f"Could not open ingestion run ({response.status}): {opened}")
            result.run_id = str(opened["run_id"])
        try:
            batches = list(_chunks(sorted(jobs, key=_persistence_priority)))
            for batch in batches:
                data = await _post_batch(session, pipeline_url, key, batch, result.run_id)
                result.persisted += int(data.get("persisted", data.get("upserted", 0)))
                result.new_strong_urls.update(str(value) for value in data.get("newStrongSourceUrls", []))
                for name in result.totals:
                    result.totals[name] += int(data.get(name, 0))
                for outcome in data.get("outcomes", []):
                    source_url = str(outcome.get("source_url", ""))
                    if not source_url:
                        continue
                    result.outcomes[source_url] = outcome
                    source = source_by_url.get(source_url, "Unknown")
                    tier = str(outcome.get("display_tier", "hidden"))
                    status = str(outcome.get("validation_status", "rejected"))
                    source_totals[source]["accepted" if tier == "strong" else "review" if tier == "watchlist" else "hidden"] += 1
                    if status == "rejected":
                        source_totals[source]["rejected"] += 1
                    if outcome.get("failed"):
                        source_totals[source]["failures"] += 1
                attributed_fingerprints: set[str] = set()
                for outcome in data.get("outcomes", []):
                    fingerprint = str(outcome.get("canonical_fingerprint", ""))
                    if not outcome.get("persisted") or not fingerprint or fingerprint in attributed_fingerprints:
                        continue
                    attributed_fingerprints.add(fingerprint)
                    source = source_by_url.get(str(outcome.get("source_url", "")), "Unknown")
                    source_totals[source]["persisted"] += 1
                for job in batch:
                    if job.official_url or job.application_url:
                        source_totals[job.source]["resolved"] += 1
            final_payload = {
                "status": "success",
                "persisted": result.persisted,
                **result.totals,
                "sources": [{"source": source, **totals} for source, totals in source_totals.items()],
                "official_snapshots": run_payload["official_snapshots"],
            }
            async with session.patch(
                f"{runs_url}/{result.run_id}", json=final_payload, headers={"x-ingest-key": key},
                timeout=aiohttp.ClientTimeout(total=60),
            ) as response:
                finalized = await response.json()
                if response.status >= 400:
                    raise RuntimeError(f"Could not finalize ingestion run ({response.status}): {finalized}")
        except Exception as exc:  # noqa: BLE001 - always close the remote run before propagating
            try:
                async with session.patch(
                    f"{runs_url}/{result.run_id}",
                    json={"status": "failed", "error_message": str(exc), "persisted": result.persisted, **result.totals,
                          "sources": [{"source": source, **totals} for source, totals in source_totals.items()]},
                    headers={"x-ingest-key": key}, timeout=aiohttp.ClientTimeout(total=30),
                ):
                    pass
            finally:
                raise
    return result


async def fetch_registered_sources() -> list[dict]:
    url = os.getenv("JOBS_API_URL")
    key = os.getenv("INGEST_API_KEY")
    if not url or not key:
        return []
    registry_url = f"{_pipeline_root(url)}/api/ingestion/sources"
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
    root = _pipeline_root(url)
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
