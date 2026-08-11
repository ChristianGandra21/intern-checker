from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl


class JobCandidate(BaseModel):
    title: str = Field(min_length=2, max_length=300)
    company: str = "Não informada"
    description: str = ""
    location: str = ""
    work_mode: Literal["remote", "hybrid", "onsite", "unknown"] = "unknown"
    source: str
    source_url: HttpUrl
    published_at: datetime | None = None
    application_deadline: datetime | None = None
    discovered_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    score: int = 0
    score_reasons: list[str] = Field(default_factory=list)
    match_area: bool = False
    area_fit: Literal["tech", "general", "non_tech", "ambiguous"] = "ambiguous"
    area_reasons: list[str] = Field(default_factory=list)
    primary_area: str = "ambiguous"
    area_tags: list[str] = Field(default_factory=list)
    dedup_group_key: str | None = None
    dedup_confidence: int = 0
    dedup_reasons: list[str] = Field(default_factory=list)
    display_tier: Literal["strong", "watchlist", "hidden"] = "hidden"
    target_fit: Literal["confirmed", "probable", "unknown", "incompatible"] = "unknown"
    location_fit: Literal["confirmed", "probable", "unknown", "incompatible"] = "unknown"
    display_reasons: list[str] = Field(default_factory=list)
    classification_version: str = "radar-v2-news-leads"
    match_location: bool = False
    match_start: bool = False
    fingerprint: str | None = None
    source_type: Literal["official", "aggregator", "social", "news", "community", "discovery"] = "discovery"
    external_id: str | None = None
    official_url: HttpUrl | None = None
    application_url: HttpUrl | None = None
    raw_payload: dict = Field(default_factory=dict)

    def api_dict(self) -> dict:
        return self.model_dump(mode="json")
