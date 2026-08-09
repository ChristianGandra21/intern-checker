from datetime import UTC, datetime

import pytest

from intern_checker.sources.sheets import (
    InvalidCommunitySheet,
    _parse_month_csv,
    _row_to_job,
    _sheet_aliases,
)

SPREADSHEET_ID = "13lutgdWIY7ezc-6PihVQcjWaqsdk0Pb-SBIEDpHx9as"


def row(**changes):
    value = {
        "Data de Inclusão": "08/08/2026",
        "Area": "Tecnologia",
        "Empresa": "Acme",
        "Cidade": "São Paulo",
        "Titulo da Vaga": "Programa de Estágio 2027",
        "Link": "https://example.com/vaga",
        "Tipo de Vaga": "Estágio",
        "Redes Sociais": "https://x.com/acme/status/1",
        "Plataforma": "Gupy",
    }
    value.update(changes)
    return value


def test_current_sheet_aliases_cover_public_alias_and_real_name():
    current = datetime(2026, 8, 8, tzinfo=UTC)
    assert _sheet_aliases(current) == ["08/2026", "082026"]


def test_community_sheet_row_maps_to_job_candidate_with_evidence():
    job = _row_to_job(row(), "082026", SPREADSHEET_ID, 2)

    assert job is not None
    assert job.source == "Planilha comunitária"
    assert job.source_type == "community"
    assert job.company == "Acme"
    assert job.location == "São Paulo"
    assert str(job.source_url) == "https://example.com/vaga"
    assert job.raw_payload["sheet"] == "082026"
    assert job.raw_payload["row_number"] == 2
    assert job.external_id


def test_sheet_rejects_apprentice_and_preserves_non_tech_for_audit():
    assert _row_to_job(row(**{"Tipo de Vaga": "Aprendiz"}), "082026", SPREADSHEET_ID, 2) is None
    non_tech = _row_to_job(row(Area="Marketing", **{"Titulo da Vaga": "Estágio em Marketing"}), "082026", SPREADSHEET_ID, 3)
    assert non_tech is not None
    assert non_tech.area_fit == "non_tech"


def test_linkedin_is_evidence_but_never_marked_official():
    job = _row_to_job(
        row(Link="https://www.linkedin.com/jobs/view/123", Area="QA", **{"Titulo da Vaga": "Quality Assurance Intern"}),
        "082026",
        SPREADSHEET_ID,
        4,
    )
    assert job is not None
    assert job.official_url is None
    assert str(job.source_url).startswith("https://www.linkedin.com/")


def test_textual_link_falls_back_to_sheet_evidence_url():
    job = _row_to_job(row(Link="Página da Vaga | Programa de Estágio", **{"Redes Sociais": ""}), "082026", SPREADSHEET_ID, 5)
    assert job is not None
    assert "docs.google.com/spreadsheets" in str(job.source_url)
    assert job.raw_payload["link_kind"] == "sheet"


def test_csv_validation_rejects_silent_default_sheet():
    text = (
        '"Data de Inclusão","Area","Empresa","Cidade","Titulo da Vaga","Link","Tipo de Vaga","Redes Sociais","Plataforma"\n'
        '"18/05/2024","Dados","Acme","São Paulo","Estágio em Dados","https://example.com","Estágio","","Site-proprio"\n'
    )
    with pytest.raises(InvalidCommunitySheet, match="provável aba padrão"):
        _parse_month_csv(text, SPREADSHEET_ID, "082026", datetime(2026, 8, 8, tzinfo=UTC))


def test_csv_validation_accepts_current_month_and_filters_rows():
    text = (
        '"Data de Inclusão","Area","Empresa","Cidade","Titulo da Vaga","Link","Tipo de Vaga","Redes Sociais","Plataforma"\n'
        '"01/08/2026","Dados","Acme","São Paulo","Estágio em Dados 2027","https://example.com/1","Estágio","","Site-proprio"\n'
        '"01/08/2026","RH","Acme","São Paulo","Estágio em RH 2027","https://example.com/2","Estágio","","Site-proprio"\n'
        '"01/08/2026","Dados","Acme","São Paulo","Aprendiz de Dados","https://example.com/3","Aprendiz","","Site-proprio"\n'
    )
    jobs = _parse_month_csv(text, SPREADSHEET_ID, "08/2026", datetime(2026, 8, 8, tzinfo=UTC))
    assert [job.title for job in jobs] == ["Estágio em Dados 2027", "Estágio em RH 2027"]
    assert [job.area_fit for job in jobs] == ["tech", "non_tech"]
