import pytest

from intern_checker.area import classify_area


@pytest.mark.parametrize(
    "title",
    [
        "Estágio em Enfermagem",
        "Estágio em Recursos Humanos",
        "Estágio em Direito",
        "Estágio em Química",
        "Estágio em Engenharia Mecânica",
        "Estágio em Engenharia Elétrica",
        "Estágio em Engenharia Civil",
    ],
)
def test_explicit_non_tech_areas_are_rejected(title):
    assert classify_area(title).area_fit == "non_tech"


@pytest.mark.parametrize(
    ("title", "description"),
    [
        ("Estágio em Engenharia de Software", "Desenvolvimento de APIs"),
        ("Estágio em Engenharia de Dados", "Pipelines de dados"),
        ("Estágio em People Analytics - RH", "Análise de dados de pessoas"),
        ("Estágio em IA aplicada à saúde", "Modelos de machine learning"),
        ("Estágio em RH", "Desenvolvimento de sistemas internos com Python e SQL"),
    ],
)
def test_explicit_technology_overrides_department(title, description):
    assert classify_area(title, description).area_fit == "tech"


def test_general_program_is_preserved():
    assert classify_area("Programa de Estágio 2027", "Trilhas definidas após a admissão").area_fit == "general"


def test_general_program_is_not_rejected_by_organization_sector():
    decision = classify_area("Programa de Estágio Rede D'Or 2027", "Empresa do setor de saúde com múltiplas trilhas")
    assert decision.area_fit == "general"
    assert decision.primary_area == "general"


def test_unspecified_engineering_is_ambiguous():
    assert classify_area("Estágio em Engenharia", "Apoio às operações").area_fit == "ambiguous"
