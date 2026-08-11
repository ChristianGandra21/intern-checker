from __future__ import annotations

import json
import re
from dataclasses import dataclass
from importlib.resources import files
from typing import Literal

from .normalize import plain

AreaFit = Literal["tech", "general", "non_tech", "ambiguous"]


@dataclass(frozen=True)
class AreaDecision:
    area_fit: AreaFit
    reasons: list[str]
    primary_area: str
    area_tags: list[str]


def _load_taxonomy() -> dict[str, list[str]]:
    return json.loads(
        files("intern_checker").joinpath("data/area-taxonomy.json").read_text(encoding="utf-8")
    )


TAXONOMY = _load_taxonomy()


def _hits(text: str, terms: list[str]) -> list[str]:
    return [term for term in terms if re.search(rf"(?<!\w){re.escape(term)}(?!\w)", text)]


def classify_area(title: str, description: str = "") -> AreaDecision:
    normalized_title = plain(title)
    normalized_content = plain(f"{title} {description}")
    strong_hits = _hits(normalized_content, TAXONOMY["tech_strong"])
    title_hits = _hits(normalized_title, TAXONOMY["tech_title"])
    skill_hits = _hits(normalized_content, TAXONOMY["tech_skills"])
    positive = [*strong_hits, *title_hits]
    if positive or len(skill_hits) >= 2:
        evidence = positive or skill_hits
        tags = detect_area_categories(title, description)
        return AreaDecision("tech", [f"sinal tecnológico: {term}" for term in evidence[:4]], tags[0] if tags else "ambiguous", tags)

    negative_hits = _hits(normalized_content, TAXONOMY["non_tech"])
    negative_title_hits = _hits(normalized_title, TAXONOMY["non_tech"])
    general_hits = _hits(normalized_title, TAXONOMY["general_program"])
    if general_hits and not negative_title_hits:
        return AreaDecision("general", ["programa geral com trilhas ainda não definidas"], "general", ["general"])
    if negative_hits:
        tags = detect_area_categories(title, description)
        return AreaDecision("non_tech", [f"área fora do foco: {term}" for term in negative_hits[:4]], tags[0] if tags else "ambiguous", tags)

    ambiguous_hits = _hits(normalized_content, TAXONOMY["ambiguous"])
    reasons = [f"área ambígua: {term}" for term in ambiguous_hits[:3]]
    tags = detect_area_categories(title, description)
    return AreaDecision("ambiguous", reasons or ["área tecnológica não confirmada"], tags[0] if tags else "ambiguous", tags)


def detect_area_categories(title: str, description: str = "") -> list[str]:
    content = plain(f"{title} {description}")
    found = [name for name, terms in TAXONOMY["categories"].items() if _hits(content, terms)]
    tech = [name for name in found if name in {"data_ai", "software", "qa", "product_design", "infra_cloud_security"}]
    return [*tech, *(name for name in found if name not in tech)]
