from datetime import UTC, datetime

from intern_checker.models import JobCandidate
from intern_checker.news import infer_news_company, normalize_news_candidate
from intern_checker.sources.rss import _parse_feed


def test_infers_company_from_hiring_headline_and_normalizes_alias():
    assert infer_news_company("Embraer abre 200 vagas para Programa de Estágio 2027") == "Embraer"
    assert infer_news_company("D'Or lança Programa de Estágio 2027") == "D'Or"
    assert infer_news_company("Rede D'Or 2027 abre vagas em Programa de Estágio") == "Rede D'Or"


def test_infers_any_company_without_a_registry():
    assert infer_news_company("Aurora Robotics anuncia Programa de Estágio 2027") == "Aurora Robotics"
    assert infer_news_company("Inscrições abertas: Nuvem Azul seleciona estagiários para 2027") == "Nuvem Azul"


def test_publisher_does_not_become_employer_without_corporate_alias():
    job = JobCandidate(
        title="Inscrições abertas para estágio 2027",
        company="Não informada",
        source="RSS",
        source_type="news",
        source_url="https://news.example/article",
        published_at=datetime.now(UTC),
        raw_payload={"publisher_name": "Portal de Notícias"},
    )
    assert normalize_news_candidate(job).company == "Não informada"


def test_rss_preserves_publisher_metadata_and_infers_company(monkeypatch):
    parsed = type("Feed", (), {})()
    parsed.entries = [{
        "title": "Unilever abre 50 vagas em programa de estágio 2027",
        "link": "https://news.example/unilever",
        "summary": "Inscrições abertas",
        "published": "2026-08-09T10:00:00-03:00",
        "source": {"title": "Exame", "href": "https://exame.com"},
    }]
    monkeypatch.setattr("intern_checker.sources.rss.feedparser.parse", lambda _: parsed)

    jobs = _parse_feed({"url": "https://feed.example/rss", "name": "Google News", "source": "RSS"})

    assert jobs[0].company == "Unilever"
    assert jobs[0].raw_payload["publisher_name"] == "Exame"
    assert jobs[0].raw_payload["publisher_url"] == "https://exame.com"
