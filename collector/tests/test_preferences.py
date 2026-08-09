from intern_checker.models import JobCandidate
from intern_checker.preferences import visible_for_preferences


def job(primary_area: str, title: str = "Estágio") -> JobCandidate:
    return JobCandidate(
        title=title,
        company="Acme",
        source="ATS",
        source_url="https://example.com/job",
        primary_area=primary_area,
    )


def test_hides_selected_category():
    assert not visible_for_preferences(
        job("administration", "Estágio administrativo"),
        {"excluded_area_categories": ["administration"], "excluded_area_terms": []},
    )


def test_general_program_is_always_visible():
    assert visible_for_preferences(
        job("general", "Programa de Estágio 2027 em relações internacionais"),
        {"excluded_area_categories": ["international_relations"], "excluded_area_terms": ["relações internacionais"]},
    )


def test_people_analytics_is_not_hidden_as_hr():
    assert visible_for_preferences(
        job("data_ai", "Estágio em People Analytics - RH"),
        {"excluded_area_categories": ["hr"], "excluded_area_terms": []},
    )
