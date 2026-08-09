from intern_checker.sources import ats


async def test_greenhouse_adapter(monkeypatch):
    async def fake_json(*_):
        return {
            "jobs": [
                {
                    "id": 42,
                    "title": "Estágio 2027",
                    "content": "<p>São Paulo</p>",
                    "location": {"name": "São Paulo"},
                    "absolute_url": "https://boards.greenhouse.io/acme/jobs/42",
                    "updated_at": "2026-08-01T00:00:00Z",
                }
            ]
        }

    monkeypatch.setattr(ats, "_get_json", fake_json)
    jobs = await ats._greenhouse(None, {"identifier": "acme", "company": "Acme"})
    assert jobs[0].external_id == "42"
    assert jobs[0].source_type == "official"
    assert jobs[0].description == "São Paulo"


async def test_lever_adapter(monkeypatch):
    async def fake_json(*_):
        return [
            {
                "id": "abc",
                "text": "Data Intern 2027",
                "descriptionPlain": "Remote",
                "categories": {"location": "Brazil"},
                "workplaceType": "remote",
                "hostedUrl": "https://jobs.lever.co/acme/abc",
                "applyUrl": "https://jobs.lever.co/acme/abc/apply",
            }
        ]

    monkeypatch.setattr(ats, "_get_json", fake_json)
    jobs = await ats._lever(None, {"identifier": "acme"})
    assert jobs[0].work_mode == "remote"
    assert str(jobs[0].application_url).endswith("/apply")


async def test_ashby_adapter(monkeypatch):
    async def fake_json(*_):
        return {
            "jobs": [
                {
                    "id": "xyz",
                    "title": "Internship 2027",
                    "descriptionPlain": "Hybrid",
                    "location": "São Paulo",
                    "isRemote": False,
                    "jobUrl": "https://jobs.ashbyhq.com/acme/xyz",
                    "applyUrl": "https://jobs.ashbyhq.com/acme/xyz/application",
                    "publishedAt": "2026-08-01T00:00:00Z",
                }
            ]
        }

    monkeypatch.setattr(ats, "_get_json", fake_json)
    jobs = await ats._ashby(None, {"identifier": "acme", "company": "Acme"})
    assert jobs[0].company == "Acme"
    assert jobs[0].external_id == "xyz"
