from __future__ import annotations

from .identity import build_dedup_context, likely_same_context
from .models import JobCandidate


def deduplicate(jobs: list[JobCandidate], similarity_threshold: int = 93) -> list[JobCandidate]:
    unique: list[JobCandidate] = []
    unique_contexts = []
    keys: set[str] = set()

    def priority(item: JobCandidate) -> tuple[int, int, int]:
        official = bool(item.official_url or item.application_url or item.source_type == "official")
        return int(official), item.score, len(item.description)

    for job in sorted(jobs, key=priority, reverse=True):
        context = build_dedup_context(job)
        identity = context.identity
        job.dedup_group_key = identity.key
        job.dedup_confidence = identity.confidence
        job.dedup_reasons = identity.reasons
        if identity.key in keys:
            continue
        if any(likely_same_context(other, context)[0] for other in unique_contexts):
            continue
        keys.add(identity.key)
        unique.append(job)
        unique_contexts.append(context)
    return unique
