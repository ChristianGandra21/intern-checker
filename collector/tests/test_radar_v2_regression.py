import json
from datetime import UTC, datetime
from pathlib import Path

import pytest

from intern_checker.models import JobCandidate
from intern_checker.prefilter import is_individual_job_url, qualified_social_lead
from intern_checker.visibility import classify_visibility

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "radar_v2.json").read_text())


@pytest.mark.parametrize("case", FIXTURE, ids=[case["name"] for case in FIXTURE])
def test_real_noise_and_eligible_examples(case):
    job = JobCandidate(
        title=case["title"],
        company="Acme",
        description=case.get("description", "Programa para estudantes de tecnologia"),
        location=case.get("location", "São Paulo, SP"),
        work_mode=case.get("work_mode", "hybrid"),
        source=case.get("source", "Careers"),
        source_type=case.get("source_type", "official"),
        source_url=case.get("source_url", "https://example.com/jobs/individual-12345"),
        published_at=datetime.now(UTC),
        area_fit=case.get("area_fit", "tech"),
        score=75,
    )
    assert classify_visibility(job).display_tier == case["expected"]


def test_portal_navigation_does_not_become_a_candidate():
    assert not is_individual_job_url("https://www.vagas.com.br/vagas-de-estagio", "Vagas.com")
    assert not is_individual_job_url("https://www.infojobs.com.br/empregos.aspx?palabra=estagio", "Infojobs")
    assert is_individual_job_url("https://www.infojobs.com.br/vaga-de-estagio-dados-em-sao-paulo__123456.aspx", "Infojobs")
    assert is_individual_job_url(
        "https://99jobs.com/aurora/jobs/499346-programa-de-estagio-aurora-2027",
        "99jobs",
    )


def test_social_lead_requires_all_minimum_signals():
    job = JobCandidate(
        title="Estágio em tecnologia 2027",
        company="Acme",
        description="Inscrições abertas para trabalho em São Paulo, Brasil",
        location="São Paulo, Brasil",
        source="Mastodon",
        source_type="social",
        source_url="https://mastodon.social/@acme/1",
        published_at=datetime.now(UTC),
    )
    assert qualified_social_lead(job)
    job.description = "Compartilhando dicas para quem procura estágio"
    assert not qualified_social_lead(job)


def test_broad_news_headline_is_treated_as_general_program():
    job = JobCandidate(
        title="Rede D'Or abre estágio 2027 com vagas em São Paulo e Rio de Janeiro",
        company="Rede D'Or",
        description="Inscrições abertas para estudantes",
        location="",
        source="RSS",
        source_type="news",
        source_url="https://news.example/rede-dor",
        published_at=datetime.now(UTC),
        area_fit="ambiguous",
        score=50,
    )
    result = classify_visibility(job)
    assert result.area_fit == "general"
    assert result.location_fit == "probable"
    assert result.display_tier == "watchlist"
