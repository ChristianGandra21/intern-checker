from intern_checker.sources import pages


async def test_public_page_uses_card_context_and_keeps_only_individual_urls(monkeypatch):
    html = """
    <main>
      <div class="card">
        <h2>Programa de Estágio Aurora 2027</h2>
        <a href="/aurora/jobs/499346-programa-de-estagio">Ver oportunidade</a>
      </div>
      <a href="/collections/estagios">Ver todas as vagas</a>
    </main>
    """

    async def fake_fetch(*_):
        return html

    monkeypatch.setattr(pages, "_fetch_text", fake_fetch)
    config = {
        "name": "Portal de teste",
        "source": "99jobs",
        "url": "https://jobs.example/collections/estagios",
        "link_selector": 'a[href*="/jobs/"], a[href*="/collections/"]',
        "title_pattern": r"(Programa de Estágio.{0,60}?20[0-9]{2})",
    }

    jobs = await pages.collect_public_pages([config])

    assert len(jobs) == 1
    assert jobs[0].title == "Programa de Estágio Aurora 2027"
    assert str(jobs[0].source_url).endswith("/aurora/jobs/499346-programa-de-estagio")
    assert jobs[0].source_type == "aggregator"
