from intern_checker.models import JobCandidate
from intern_checker.visibility import classify_visibility


def make_job(title: str, location: str = "São Paulo", work_mode: str = "hybrid") -> JobCandidate:
    return JobCandidate(
        title=title,
        company="Acme",
        description="Programa para estudantes de tecnologia.",
        location=location,
        work_mode=work_mode,
        source="Careers",
        source_url="https://example.com/job",
        area_fit="tech",
        score=70,
    )


def test_unknown_year_enters_watchlist():
    result = classify_visibility(make_job("Estágio em Software"))
    assert result.display_tier == "watchlist"
    assert result.target_fit == "unknown"


def test_2027_unknown_location_enters_watchlist():
    result = classify_visibility(make_job("Programa de Estágio 2027", "", "unknown"))
    assert result.display_tier == "watchlist"
    assert result.location_fit == "unknown"


def test_explicit_2026_is_hidden():
    result = classify_visibility(make_job("Programa de Estágio 2026.2"))
    assert result.display_tier == "hidden"
    assert result.target_fit == "incompatible"


def test_foreign_onsite_role_is_hidden():
    result = classify_visibility(make_job("Data Science Intern", "Toronto, Canada", "onsite"))
    assert result.display_tier == "hidden"
    assert result.location_fit == "incompatible"


def test_complete_2027_role_is_strong():
    result = classify_visibility(make_job("Estágio em Dados 2027.1"))
    assert result.display_tier == "strong"


def test_generic_listing_page_is_hidden():
    result = make_job("Programa de Estágio 2027")
    result.source_url = "https://portal.gupy.io/job-search"
    assert classify_visibility(result).display_tier == "hidden"


def test_mixed_internship_and_trainee_program_is_preserved():
    result = classify_visibility(make_job("Programa de Estágio e Trainee 2027"))
    assert result.display_tier == "strong"
