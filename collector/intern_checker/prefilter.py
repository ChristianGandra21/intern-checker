from __future__ import annotations

import re
from urllib.parse import urlsplit

from .models import JobCandidate
from .normalize import plain

INTERNSHIP = re.compile(r"(?<!\w)(estagio|estagiari[oa]s?|internship|intern|programa (?:de )?estagio)(?!\w)")
HIRING = re.compile(r"(?<!\w)(inscricoes? abertas?|candidate-se|candidatura|apply|aplique|hiring|contratando|processo seletivo|vaga|oportunidade)(?!\w)")
TARGET = re.compile(r"(?<!\w)2027(?:[.\/-]?[12])?(?!\w)")
BRAZIL_SP = re.compile(r"(?<!\w)(brasil|brazil|sao paulo|osasco|barueri|campinas|guarulhos|remoto no brasil|remote brazil|sp,? br)(?!\w)")
SEEKER_ARTICLE = re.compile(r"#?opentowork|(?<!\w)(busco|procurando|looking for) .{0,35}(estagio|internship)|como (conseguir|encontrar)|dicas? para|guia (de|para)")
GENERIC_TITLE = re.compile(r"^(vagas?|carreiras?|oportunidades?|sao paulo|brasil|home office(?: \(\d+\))?|\d+ vagas?.*)$")


def is_individual_job_url(value: str, source: str = "") -> bool:
    try:
        url = urlsplit(value)
    except ValueError:
        return False
    path = url.path.rstrip("/").lower()
    if not path or path in {"/jobs", "/job", "/vagas", "/careers", "/carreiras", "/estudantes"}:
        return False
    if any(token in path for token in ("job-search", "lista-de-vagas", "/search", "/filtros", "/localizacao")):
        return False
    host = url.netloc.lower()
    patterns = {
        "infojobs": r"/vaga-de-.+__\d+\.aspx$|/job/\d+",
        "vagas.com": r"/vagas/v\d+|/vaga/\d+",
        "ciee": r"/vaga[s]?/[a-z0-9_-]{4,}",
        "gupy": r"/job-results/[a-f0-9-]{20,}|/jobs/[a-f0-9-]{20,}",
        "solides": r"/vaga/\d+|/vagas/[a-z0-9_-]{5,}",
        "catho": r"/vaga/[a-z0-9_-]{5,}|/vagas/[a-z0-9_-]{5,}",
        "99jobs": r"/jobs?/\d+|/vagas?/\d+",
    }
    for domain, pattern in patterns.items():
        if domain in host:
            return bool(re.search(pattern, path))
    return bool(re.search(r"/(?:jobs?|vagas?|positions?|opportunities|vacancy)/(?:view/)?[a-z0-9][a-z0-9_-]{4,}|/jobdetail/", path))


def qualified_social_lead(job: JobCandidate) -> bool:
    content = plain(f"{job.title} {job.description} {job.location}")
    company = plain(job.company)
    identifiable = bool(company and company not in {"nao informada", "mastodon", "telegram", "rss", "google news"})
    return bool(
        identifiable
        and INTERNSHIP.search(content)
        and HIRING.search(content)
        and TARGET.search(content)
        and BRAZIL_SP.search(content)
        and not SEEKER_ARTICLE.search(content)
    )


def keep_before_enrichment(job: JobCandidate) -> bool:
    title = plain(job.title)
    if GENERIC_TITLE.fullmatch(title) or SEEKER_ARTICLE.search(plain(f"{job.title} {job.description}")):
        return False
    if job.source_type == "social" or job.source in {"Mastodon", "Telegram", "Bluesky", "Reddit", "X"}:
        return qualified_social_lead(job)
    if job.source_type in {"official", "community", "news"}:
        return True
    if job.source in {"Infojobs", "Vagas.com", "CIEE", "Nube", "Catho", "Solides", "99jobs"}:
        return is_individual_job_url(str(job.source_url), job.source)
    return True
