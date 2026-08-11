from bs4 import BeautifulSoup

from intern_checker.enrich import (
    _deadline,
    _is_blocked_social,
    _is_program_landing,
    _jsonld_job,
    _jsonld_news,
    _link_score,
    _location,
)
from intern_checker.models import JobCandidate


def test_extracts_jobposting_jsonld():
    soup = BeautifulSoup(
        '<script type="application/ld+json">{"@type":"JobPosting","title":"Estágio 2027"}</script>',
        "html.parser",
    )
    assert _jsonld_job(soup)["title"] == "Estágio 2027"


def test_extracts_nested_job_location():
    data = {
        "jobLocation": {
            "address": {"addressLocality": "São Paulo", "addressRegion": "SP", "addressCountry": "BR"}
        }
    }
    assert _location(data) == "São Paulo, SP, BR"


def test_extracts_news_article_jsonld():
    soup = BeautifulSoup(
        '<script type="application/ld+json">{"@type":"NewsArticle","headline":"Inscrições abertas"}</script>',
        "html.parser",
    )
    assert _jsonld_news(soup)["headline"] == "Inscrições abertas"


def test_application_link_ranking_prefers_individual_ats():
    assert _link_score("https://acme.gupy.io/job/123", "Candidate-se") > _link_score(
        "https://acme.com/carreiras", "Carreiras"
    )
    assert _link_score("https://portal.gupy.io/job-search", "Vagas") < 50


def test_linkedin_and_x_are_never_opened_directly():
    assert _is_blocked_social("https://www.linkedin.com/jobs/view/123")
    assert _is_blocked_social("https://x.com/acme/status/1")


def test_extracts_application_deadline_from_jobposting():
    assert _deadline({"validThrough": "2026-10-31T23:59:59-03:00"}).isoformat() == "2026-10-31T23:59:59-03:00"


def test_recognizes_generic_official_program_landing():
    soup = BeautifulSoup(
        "<html><h1>Programa de Estágio Aurora 2027</h1>"
        "<main><p>Inscrições abertas para tecnologia em São Paulo.</p></main></html>",
        "html.parser",
    )
    job = JobCandidate(
        title="Programa de Estágio Aurora 2027",
        company="Aurora",
        source="Portais especializados",
        source_url="https://estagio-aurora.example/",
        source_type="aggregator",
    )
    assert _is_program_landing(job, soup, str(job.source_url), soup.get_text(" "))
