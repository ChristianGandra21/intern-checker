from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from urllib.parse import urlsplit

from .models import JobCandidate
from .news import normalize_news_candidate, useful_company
from .normalize import plain

CLASSIFICATION_VERSION = "radar-v2-news-leads"
INTERNSHIP = re.compile(
    r"(?<!\w)(estagio|estagiari[oa]s?|internship|intern|programa (?:de )?estagio|summer intern)(?!\w)"
)
GENERIC_TITLE = re.compile(
    r"^(vagas?|carreiras?|oportunidades?|saiba mais|acesse|clique aqui|ver vagas?|estagio|home|inicio|"
    r"sao paulo|brasil|home office(?: \(\d+\))?|\d+ vagas?.*)$"
)
LISTING_TITLE = re.compile(r"^(?:\d[\d.,]* vagas?|vagas? (?:de|para))|search thousands of jobs|avaliacoes da empresa")
SEEKER_ARTICLE = re.compile(r"#?opentowork|(?<!\w)(busco|procurando|looking for) .{0,35}(estagio|internship)|como (conseguir|encontrar)|dicas? para|guia (de|para)|recrutador(?:a|es)?")
HIRING = re.compile(
    r"(?<!\w)(inscricoes? abertas?|candidate-se|candidatura|apply|aplique|hiring|contratando|"
    r"processo seletivo|vaga|oportunidade)(?!\w)|(?<!\w)(abre|abrem|lanca|lancam|oferece|"
    r"oferecem|anuncia|anunciam)(?!\w).{0,55}(?<!\w)(vagas?|inscricoes?|programa|estagio)(?!\w)"
)
NON_JOB_TITLE = re.compile(
    r"(?<!\w)(concurso|vestibular|fies|cursos? gratuito|professor(?:a|es)?|licitacao|premio|"
    r"nomeacao|jovem aprendiz|aprendizagem)(?!\w)"
)
SENIOR_TITLE = re.compile(r"(?<!\w)(senior|staff|principal|lead)(?!\w)")
CLOSED = re.compile(
    r"(?<!\w)(vaga encerrada|inscricoes encerradas?|processo seletivo encerrado|nao esta mais aceitando|"
    r"job (?:is )?closed|position (?:has been )?filled|no longer accepting)(?!\w)"
)
SP_LOCATION = re.compile(
    r"(?<!\w)(sao paulo|osasco|barueri|abc paulista|campinas|guarulhos|jundiai|santo andre|"
    r"sao bernardo|sao caetano|cotia|jandira|sorocaba|sao jose dos campos|gaviao peixoto|"
    r"botucatu|taubate|sp,? br)(?!\w)"
)


def _listing_url(job: JobCandidate) -> bool:
    path = urlsplit(str(job.source_url)).path.rstrip("/").lower()
    return path in {"", "/jobs", "/vagas", "/careers", "/carreiras", "/estudantes"} or "job-search" in path


def _objectively_hidden(job: JobCandidate) -> bool:
    title = plain(job.title)
    content = plain(f"{job.title} {job.description}")
    mixed_program = bool(INTERNSHIP.search(content) and re.search(r"(?<!\w)trainee(?!\w)", title))
    bad_title = bool(
        GENERIC_TITLE.fullmatch(title)
        or LISTING_TITLE.search(title)
        or SEEKER_ARTICLE.search(content)
        or NON_JOB_TITLE.search(title)
        or SENIOR_TITLE.search(title)
        or (re.search(r"(?<!\w)trainee(?!\w)", title) and not mixed_program)
    )
    http_status = int(job.raw_payload.get("official_http_status") or job.raw_payload.get("http_status") or 0)
    expired = bool(job.application_deadline and job.application_deadline < datetime.now(UTC))
    stale_news = bool(
        job.source_type == "news"
        and job.published_at
        and not job.application_deadline
        and job.published_at < datetime.now(UTC) - timedelta(days=120)
    )
    official_program = bool(
        job.source_type != "news"
        and INTERNSHIP.search(title)
        and HIRING.search(content)
        and (job.official_url or job.application_url or job.source_type == "official")
    )
    return bad_title or (_listing_url(job) and not official_program) or bool(CLOSED.search(content)) or http_status in {404, 410} or expired or stale_news


def target_fit(job: JobCandidate) -> str:
    title = plain(job.title)
    content = plain(job.description)
    full = f"{title} {content}"
    old_title = re.search(r"(?<!\w)20(?:1\d|2[0-6])(?:[.\/-]?\d)?(?!\w)", title) and not re.search(
        r"(?<!\w)2027(?:[.\/-]?[12])?(?!\w)", title
    )
    old_context = re.search(
        r"(?<!\w)(?:inicio|comeco|ciclo|turma|semestre|programa (?:de )?estagio|estagio)(?!\w).{0,70}"
        r"(?<!\w)20(?:1\d|2[0-6])(?:[.\/-]?\d)?(?!\w)",
        content,
    )
    if old_title or (old_context and not re.search(r"(?<!\w)2027(?!\w)", full)):
        return "incompatible"
    if re.search(r"(?<!\w)(?:2027[.\/-]?1|1[.\/-]2027|primeiro semestre (?:de )?2027)(?!\w)", full):
        return "confirmed"
    if re.search(r"(?<!\w)2027(?!\w)", full):
        return "probable"
    return "unknown"


def location_fit(job: JobCandidate) -> str:
    location = plain(job.location)
    content = plain(f"{job.title} {job.description}")
    remote = job.work_mode == "remote" or bool(re.search(r"(?<!\w)(remoto|remote|home office)(?!\w)", location))
    unknown_location = not location or location in {"br", "brasil", "brazil", "nao informado", "unknown"}
    foreign = re.search(
        r"(?<!\w)(canada|united states|usa|estados unidos|europe|europa|united kingdom|uk|reino unido|"
        r"mexico|argentina|chile|colombia|india|singapore|australia|germany|france|spain|portugal|"
        r"ireland|netherlands|poland|japan|china|israel|dubai|uae|toronto|vancouver|new york|miami|"
        r"california|seattle|london|madras|bangalore|berlin)(?!\w)",
        f"{location} {content}" if unknown_location or remote else location,
    )
    if foreign:
        return "incompatible"
    if remote:
        brazil = re.search(r"(?<!\w)(br|brasil|brazil)(?!\w)", location) or re.search(
            r"(?<!\w)(remoto|remote|home office)(?!\w).{0,45}(?<!\w)(brasil|brazil)(?!\w)", content
        )
        return "confirmed" if brazil else "unknown"
    if SP_LOCATION.search(location):
        return "confirmed"
    outside_sp = re.search(
        r"(?<!\w)(rio de janeiro|rj|minas gerais|belo horizonte|mg|bahia|salvador|ba|parana|curitiba|pr|"
        r"santa catarina|florianopolis|sc|rio grande do sul|porto alegre|rs|pernambuco|recife|pe|ceara|"
        r"fortaleza|ce|distrito federal|brasilia|df|goias|goiania)(?!\w)", location
    )
    if outside_sp:
        return "incompatible"
    if unknown_location and SP_LOCATION.search(content):
        return "probable"
    if unknown_location and re.search(
        r"(?<!\w)(rio de janeiro|minas gerais|belo horizonte|bahia|salvador|parana|curitiba|"
        r"santa catarina|florianopolis|rio grande do sul|porto alegre|pernambuco|recife|ceara|"
        r"fortaleza|distrito federal|brasilia|goias|goiania)(?!\w)", content
    ):
        return "incompatible"
    return "unknown"


def classify_visibility(job: JobCandidate) -> JobCandidate:
    job = normalize_news_candidate(job)
    target = target_fit(job)
    location = location_fit(job)
    content_plain = plain(f"{job.title} {job.description}")
    if (
        job.source_type == "news"
        and job.area_fit == "ambiguous"
        and INTERNSHIP.search(plain(job.title))
        and HIRING.search(content_plain)
        and target != "incompatible"
    ):
        job.area_fit = "general"
        job.area_reasons = ["notícia sobre programa geral de estágio"]
        job.primary_area = "general"
        job.area_tags = ["general"]
    reasons: list[str] = []
    if target == "unknown":
        reasons.append("ano de início não informado")
    if location == "unknown":
        reasons.append("localização não confirmada")
    if not job.official_url and not job.application_url:
        reasons.append("link oficial pendente")
    if target == "incompatible":
        reasons.append("ciclo explicitamente incompatível")
    if location == "incompatible":
        reasons.append("localização explicitamente incompatível")
    is_lead = job.source_type in {"social", "news"}
    recent = bool(job.published_at and job.published_at >= datetime.now(UTC) - timedelta(days=45))
    identifiable_company = useful_company(job.company)
    qualified_news_unknown_location = job.source_type == "news" and location == "unknown"
    qualified_lead = not is_lead or bool(
        recent
        and identifiable_company
        and HIRING.search(content_plain)
        and target in {"confirmed", "probable"}
        and (location in {"confirmed", "probable"} or qualified_news_unknown_location)
    )
    if is_lead and not qualified_lead:
        reasons.append("lead sem todos os sinais mínimos de contratação, empresa, ciclo e Brasil/SP")
    compatible = (
        job.area_fit in {"tech", "general"}
        and bool(INTERNSHIP.search(plain(f"{job.title} {job.description}")))
        and target != "incompatible"
        and location != "incompatible"
        and (location in {"confirmed", "probable"} or qualified_news_unknown_location)
        and not _objectively_hidden(job)
        and qualified_lead
    )
    if not compatible:
        tier = "hidden"
    elif not is_lead and target in {"confirmed", "probable"} and location in {"confirmed", "probable"} and job.score >= 55:
        tier = "strong"
        reasons.append("ciclo e localização compatíveis")
    else:
        tier = "watchlist"
        if is_lead and location == "unknown":
            reasons.append("notícia qualificada aguardando localização")
        else:
            reasons.append("oportunidade compatível aguardando confirmação")
    if is_lead and location == "probable" and SP_LOCATION.search(plain(f"{job.title} {job.description}")):
        reasons.append("programa inclui localidade em São Paulo")
    job.target_fit = target  # type: ignore[assignment]
    job.location_fit = location  # type: ignore[assignment]
    job.display_tier = tier  # type: ignore[assignment]
    job.display_reasons = list(dict.fromkeys(reasons))
    job.classification_version = CLASSIFICATION_VERSION
    return job
