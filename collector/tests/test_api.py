from intern_checker.api import _chunks, _persistence_priority
from intern_checker.models import JobCandidate


def make_job(index: int) -> JobCandidate:
    return JobCandidate(
        title=f"Programa de Estágio 2027 #{index}",
        company="Acme",
        source="Test",
        source_url=f"https://example.com/jobs/{index}",
    )


def test_chunks_large_api_payloads():
    jobs = [make_job(index) for index in range(901)]

    chunks = list(_chunks(jobs, 450))

    assert [len(chunk) for chunk in chunks] == [450, 450, 1]


def test_official_candidate_is_persisted_after_news_duplicate():
    news = JobCandidate(
        title="Estágio 2027",
        source="RSS",
        source_url="https://news.example/vaga",
        source_type="news",
    )
    official = JobCandidate(
        title="Estágio 2027",
        source="Gupy",
        source_url="https://acme.gupy.io/job/1",
        source_type="official",
    )
    assert sorted([official, news], key=_persistence_priority) == [news, official]
