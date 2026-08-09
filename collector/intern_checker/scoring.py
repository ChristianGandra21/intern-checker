from __future__ import annotations

import re
from dataclasses import dataclass

from .area import classify_area
from .models import JobCandidate
from .normalize import plain


@dataclass(frozen=True)
class Rule:
    terms: tuple[str, ...]
    weight: int
    reason: str


INTERNSHIP_TERMS = (
    "estagio",
    "estagiario",
    "internship",
    "intern",
    "programa de estagio",
    "programa estagio",
    "programa de estagiarios",
    "programa de estagiarias",
    "jovens talentos",
    "jovem talento",
    "early careers",
    "summer intern",
    "trainee universitario",
)
AREA_RULES = (
    Rule(("machine learning", "aprendizado de maquina", "ml engineer"), 28, "Machine Learning"),
    Rule(("ciencia de dados", "data science", "cientista de dados"), 26, "Ciência de Dados"),
    Rule(("engenharia de dados", "data engineering", "data engineer"), 22, "Engenharia de Dados"),
    Rule(
        ("inteligencia artificial", "artificial intelligence", "generative ai", "llm"),
        26,
        "Inteligência Artificial",
    ),
    Rule(
        ("analise de dados", "data analytics", "data analyst", "bi", "business intelligence"),
        18,
        "Analytics / BI",
    ),
    Rule(("python", "sql", "pandas", "pytorch", "tensorflow", "scikit-learn"), 8, "stack de dados"),
)
TITLE_NEGATIVE_RULES = (
    Rule(("senior", "sr.", "especialista", "staff", "principal"), -55, "senioridade incompatível"),
    Rule(("pleno", "mid-level", "mid level"), -35, "vaga de nível pleno"),
)
CONTENT_NEGATIVE_RULES = (
    Rule(("pj", "prestador de servico"), -12, "contratação PJ"),
)
LOCATION_TERMS = ("sao paulo", "sp", "remoto", "remote", "brasil", "brazil", "osasco", "barueri")
START_TERMS = (
    "2027.1",
    "1.2027",
    "2027/1",
    "2027-1",
    "2027 1",
    "2027",
    "primeiro semestre de 2027",
    "1 semestre de 2027",
    "janeiro de 2027",
    "fevereiro de 2027",
    "marco de 2027",
)


def contains_any(text: str, terms: tuple[str, ...]) -> bool:
    return any(re.search(rf"(?<!\w){re.escape(term)}(?!\w)", text) for term in terms)


def score_job(job: JobCandidate) -> JobCandidate:
    title = plain(job.title)
    content = plain(f"{job.title} {job.description}")
    location = plain(f"{job.location} {job.description}")
    score = 0
    reasons: list[str] = []

    if contains_any(title, INTERNSHIP_TERMS):
        score += 30
        reasons.append("nível estágio no título")
    elif contains_any(content, INTERNSHIP_TERMS):
        score += 20
        reasons.append("nível estágio na descrição")
    else:
        score -= 35
        reasons.append("estágio não confirmado")

    row_payload = job.raw_payload.get("row") if isinstance(job.raw_payload, dict) else None
    structured_area = str(row_payload.get("area", "")) if isinstance(row_payload, dict) else ""
    area = classify_area(f"{structured_area} {job.title}", job.description)
    job.area_fit = area.area_fit
    job.area_reasons = area.reasons
    job.primary_area = area.primary_area
    job.area_tags = area.area_tags
    job.match_area = area.area_fit == "tech"
    if area.area_fit == "tech":
        score += 24
        reasons.extend(area.reasons)
    elif area.area_fit == "general":
        score += 10
        reasons.extend(area.reasons)
    elif area.area_fit == "non_tech":
        score -= 80
        reasons.extend(area.reasons)
    else:
        score -= 15
        reasons.extend(area.reasons)

    area_hits = 0
    for rule in AREA_RULES:
        if contains_any(content, rule.terms):
            score += min(rule.weight, 12) if area_hits == 0 else min(rule.weight, 4)
            area_hits += 1
            reasons.append(rule.reason)

    job.match_location = job.work_mode == "remote" or contains_any(location, LOCATION_TERMS)
    if job.match_location:
        score += 18
        reasons.append("localização compatível")
    else:
        reasons.append("localização não confirmada")

    job.match_start = contains_any(content, START_TERMS)
    if job.match_start:
        score += 25
        reasons.append("início 2027.1")
    else:
        score -= 18
        reasons.append("início 2027.1 não confirmado")

    for rule in TITLE_NEGATIVE_RULES:
        if contains_any(title, rule.terms):
            score += rule.weight
            reasons.append(rule.reason)
    for rule in CONTENT_NEGATIVE_RULES:
        if contains_any(content, rule.terms):
            score += rule.weight
            reasons.append(rule.reason)

    job.score = max(0, min(score, 100))
    job.score_reasons = list(dict.fromkeys(reasons))
    return job
