from intern_checker.models import JobCandidate
from intern_checker.normalize import normalize_job
from intern_checker.scoring import score_job


def test_high_match_data_internship():
    job = JobCandidate(
        title="Estágio em Machine Learning",
        company="Acme",
        description="Python, SQL e início no primeiro semestre de 2027. Modelo híbrido.",
        location="São Paulo, SP",
        source="Careers",
        source_url="https://example.com/jobs/123?utm_source=test",
    )
    result = score_job(normalize_job(job))
    assert result.score >= 80
    assert result.match_area is True
    assert result.match_location is True
    assert result.match_start is True
    assert "utm_source" not in str(result.source_url)
    assert result.api_dict()["source_url"] == "https://example.com/jobs/123"


def test_senior_role_is_rejected_by_score():
    job = JobCandidate(
        title="Senior Data Scientist",
        description="Machine learning, Python, remote Brazil",
        location="Remote",
        source="Web",
        source_url="https://example.com/jobs/senior",
    )
    result = score_job(normalize_job(job))
    assert result.score < 55


def test_senior_people_mentioned_in_description_do_not_reject_internship():
    job = JobCandidate(
        title="Estágio em Dados 2027",
        description="Acompanhamento de profissionais seniores e principal oportunidade de aprendizado com Python e SQL.",
        location="São Paulo",
        source="Careers",
        source_url="https://example.com/jobs/intern",
    )
    result = score_job(normalize_job(job))
    assert "senioridade incompatível" not in result.score_reasons
    assert result.score >= 55


def test_general_2027_internship_is_accepted_without_area_match():
    job = JobCandidate(
        title="Programa de Estágio 2027",
        description="Programa corporativo com trilhas definidas durante o processo seletivo.",
        location="São Paulo",
        source="Web",
        source_url="https://example.com/jobs/programa-2027",
    )
    result = score_job(normalize_job(job))
    assert result.match_area is False
    assert result.match_start is True
    assert result.score >= 55


def test_general_2027_internship_with_unknown_location_keeps_enough_score():
    job = JobCandidate(
        title="Programa de Estágio 2027",
        description="Inscrições abertas para estudantes universitários.",
        location="",
        source="Web",
        source_url="https://example.com/jobs/general-2027",
    )
    result = score_job(normalize_job(job))
    assert result.match_location is False
    assert result.match_start is True
    assert result.score >= 55


def test_early_careers_2027_program_is_accepted():
    job = JobCandidate(
        title="Jovens Talentos 2027",
        description="Programa para estudantes universitários com início em 2027/1.",
        location="Brasil",
        source="Web",
        source_url="https://example.com/jobs/early-careers-2027",
    )
    result = score_job(normalize_job(job))
    assert result.match_start is True
    assert result.score >= 55


def test_internship_without_2027_start_is_not_enough_for_ingestion_gate():
    job = JobCandidate(
        title="Estágio em Dados",
        description="Python, SQL e modelo híbrido.",
        location="São Paulo",
        source="Web",
        source_url="https://example.com/jobs/no-start",
    )
    result = score_job(normalize_job(job))
    assert result.match_area is True
    assert result.match_start is False


def test_short_keywords_do_not_match_inside_words():
    job = JobCandidate(
        title="Estágio em Contabilidade",
        description="Apoio contábil e conciliações para empresa especialista no setor.",
        location="Recife, PE",
        source="RSS",
        source_url="https://example.com/jobs/accounting",
    )
    result = score_job(normalize_job(job))
    assert result.match_area is False
    assert result.match_location is False
