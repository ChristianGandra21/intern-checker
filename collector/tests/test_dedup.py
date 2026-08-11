import intern_checker.dedup as dedup_module
from intern_checker.dedup import deduplicate
from intern_checker.identity import likely_same_opportunity
from intern_checker.models import JobCandidate
from intern_checker.normalize import normalize_job


def make_job(title: str, url: str) -> JobCandidate:
    return normalize_job(
        JobCandidate(
            title=title, company="Acme", location="São Paulo", source="Web", source_url=url, score=80
        )
    )


def test_deduplicates_tracking_urls():
    jobs = [
        make_job("Estágio em Data Science", "https://example.com/job/1?utm_source=a"),
        make_job("Estágio em Data Science", "https://example.com/job/1?utm_source=b"),
    ]
    assert len(deduplicate(jobs)) == 1


def test_deduplicates_similar_titles_from_different_sources():
    jobs = [
        make_job("Estágio em Ciência de Dados", "https://example.com/job/1"),
        make_job("Estagio - Ciencia de Dados", "https://another.example/job/88"),
    ]
    assert len(deduplicate(jobs)) == 1


def test_groups_program_news_variations_globally():
    jobs = [
        make_job("Rede D'Or abre inscrições para Programa de Estágio 2027 - Portal Hortolândia", "https://news.example/a"),
        make_job("PROGRAMA DE ESTÁGIO REDE D'OR 2027 - Correio da Lavoura", "https://news.example/b"),
        make_job("Rede D'Or 2027 abre vagas em Programa de Estágio", "https://social.example/post/8"),
    ]
    assert len(deduplicate(jobs)) == 1


def test_groups_news_and_official_page_for_same_company_program_cycle():
    news = make_job("Embraer abre 200 vagas para Programa de Estágio 2027", "https://news.example/embraer")
    news.company = "Embraer"
    official = make_job("Programa de Estágio Embraer 2027", "https://embraer.com/programa-estagio")
    official.company = "Embraer"
    official.official_url = "https://embraer.com/programa-estagio"
    assert len(deduplicate([news, official])) == 1


def test_groups_news_headline_variations_without_losing_sources():
    first = make_job(
        "Unilever abre 50 vagas em programa de estágio 2027; participe!",
        "https://news.example/one",
    )
    second = make_job(
        "Unilever abre inscrições para o Programa de Estágio 2027",
        "https://news.example/two",
    )
    for item in (first, second):
        item.company = "Unilever"
        item.source = "RSS"
        item.source_type = "news"
    assert len(deduplicate([first, second])) == 1


def test_keeps_distinct_named_programs_at_same_company_and_cycle():
    banking = make_job("2027 Brazil Investment Banking Internship Program", "https://example.com/banking")
    assistant = make_job(
        "2027 Executive Assistant Administrative Support Internship Program",
        "https://example.com/assistant",
    )
    assert len(deduplicate([banking, assistant])) == 2


def test_does_not_group_different_companies_or_cycles():
    acme = make_job("Programa de Estágio 2027.1", "https://news.example/acme")
    other = make_job("Programa de Estágio 2027.1", "https://news.example/other")
    other.company = "Outra Empresa"
    later = make_job("Programa de Estágio 2027.2", "https://news.example/later")
    assert likely_same_opportunity(acme, other)[0] is False
    assert likely_same_opportunity(acme, later)[0] is False


def test_keeps_distinct_roles_at_same_company():
    jobs = [
        make_job("Estágio em Dados", "https://example.com/jobs/data"),
        make_job("Estágio em Desenvolvimento Backend", "https://example.com/jobs/backend"),
    ]
    assert len(deduplicate(jobs)) == 2


def test_builds_each_identity_only_once_during_deduplication(monkeypatch):
    jobs = [make_job(f"Estágio em área {index}", f"https://example.com/jobs/{index}") for index in range(40)]
    original = dedup_module.build_dedup_context
    calls = 0

    def counted(job):
        nonlocal calls
        calls += 1
        return original(job)

    monkeypatch.setattr(dedup_module, "build_dedup_context", counted)
    deduplicate(jobs)

    assert calls == len(jobs)
