from __future__ import annotations

from .models import JobCandidate
from .normalize import plain


def visible_for_preferences(job: JobCandidate, preferences: dict) -> bool:
    if job.primary_area == "general":
        return True
    excluded = set(preferences.get("excluded_area_categories") or [])
    if job.primary_area in excluded:
        return False
    content = plain(f"{job.title} {job.company} {job.description}")
    return not any(plain(term) in content for term in preferences.get("excluded_area_terms") or [] if term)
