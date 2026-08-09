from __future__ import annotations

from .identity import build_dedup_identity, likely_same_opportunity
from .models import JobCandidate


def deduplicate(jobs: list[JobCandidate], similarity_threshold: int = 93) -> list[JobCandidate]:
    unique: list[JobCandidate] = []
    keys: set[str] = set()

    def priority(item: JobCandidate) -> tuple[int, int, int]:
        official = bool(item.official_url or item.application_url or item.source_type == "official")
        return int(official), item.score, len(item.description)

    for job in sorted(jobs, key=priority, reverse=True):
        identity = build_dedup_identity(job)
        job.dedup_group_key = identity.key
        job.dedup_confidence = identity.confidence
        job.dedup_reasons = identity.reasons
        if identity.key in keys:
            continue
        match = next((other for other in unique if likely_same_opportunity(other, job)[0]), None)
        if match:
            continue
        keys.add(identity.key)
        unique.append(job)
    return unique
