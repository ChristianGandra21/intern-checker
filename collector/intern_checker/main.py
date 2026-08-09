from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from collections import Counter
from pathlib import Path

import yaml

from .api import fetch_area_preferences, fetch_registered_sources, send_to_api
from .dedup import deduplicate
from .enrich import enrich_candidates
from .env import load_env_files
from .exporters import export_jobs
from .normalize import normalize_job
from .notify import send_email, send_telegram
from .preferences import visible_for_preferences
from .scoring import score_job
from .sources.alerts import collect_google_alerts
from .sources.ats import collect_ats_sources
from .sources.careers import collect_career_pages
from .sources.pages import collect_public_pages
from .sources.rendered import collect_rendered_pages
from .sources.rss import collect_feeds
from .sources.search import collect_searches
from .sources.sheets import collect_community_sheets
from .sources.social import collect_social_sources
from .visibility import classify_visibility

log = logging.getLogger("intern_checker")


def load_config(path: str | Path) -> dict:
    with Path(path).open(encoding="utf-8") as file:
        config = yaml.safe_load(file) or {}
    alerts = config.get("google_alerts", {})
    alerts["user"] = os.getenv("ALERTS_IMAP_USER", alerts.get("user"))
    alerts["password"] = os.getenv("ALERTS_IMAP_PASSWORD", alerts.get("password"))
    config["google_alerts"] = alerts
    return config


SOURCE_TYPES = {
    "RSS": "news",
    "Google Alerts": "news",
    "Mastodon": "social",
    "X": "social",
    "Bluesky": "social",
    "Reddit": "social",
    "Hacker News": "social",
    "Telegram": "social",
    "Forums": "community",
    "Communities": "community",
    "Planilha comunitária": "community",
}


async def run(
    config_path: str,
    output_dir: str,
    min_score: int | None = None,
    dry_run: bool = False,
) -> int:
    config = load_config(config_path)
    registered_sources, area_preferences = await asyncio.gather(
        fetch_registered_sources(), fetch_area_preferences()
    )
    configured_ats = config.get("ats", {}).get("sources", [])
    ats_sources = [
        *configured_ats,
        *(
            source
            for source in registered_sources
            if source.get("adapter") in {"greenhouse", "lever", "ashby"}
        ),
    ]
    search_config = config.get("search", {})
    rendered_config = config.get("rendered_pages", {})
    (
        sheet_jobs,
        search_jobs,
        rss_jobs,
        career_jobs,
        page_jobs,
        rendered_jobs,
        social_jobs,
        alert_jobs,
        ats_jobs,
    ) = await asyncio.gather(
        collect_community_sheets(config.get("community_sheet", {})),
        collect_searches(
            config.get("searches", []),
            int(search_config.get("max_results", 12)),
            int(search_config.get("concurrency", 4)),
            search_config.get("region", "br-pt"),
            search_config.get("timelimit", "m"),
        ),
        collect_feeds(config.get("feeds", [])),
        collect_career_pages(config.get("companies", [])),
        collect_public_pages(
            config.get("public_pages", []), int(config.get("pages", {}).get("concurrency", 5))
        ),
        collect_rendered_pages(
            rendered_config.get("pages", []), int(rendered_config.get("concurrency", 2))
        ),
        collect_social_sources(
            config.get("social", {}), int(config.get("social", {}).get("concurrency", 6))
        ),
        collect_google_alerts(config.get("google_alerts")),
        collect_ats_sources(ats_sources, int(config.get("ats", {}).get("concurrency", 4))),
    )
    # A ordem define a prioridade do orçamento de enriquecimento.
    raw_jobs = [
        *ats_jobs,
        *career_jobs,
        *page_jobs,
        *rendered_jobs,
        *sheet_jobs,
        *rss_jobs,
        *alert_jobs,
        *search_jobs,
        *social_jobs,
    ]
    for job in raw_jobs:
        if job.source_type == "discovery":
            job.source_type = SOURCE_TYPES.get(job.source, "aggregator")  # type: ignore[assignment]
    enrichment = config.get("enrichment", {})
    raw_jobs = await enrich_candidates(
        raw_jobs, int(enrichment.get("concurrency", 10)), int(enrichment.get("limit", 250))
    )
    source_summary = dict(Counter(job.source for job in raw_jobs))
    scored = [score_job(normalize_job(job)) for job in raw_jobs]
    candidates = [job for job in scored if job.score >= min_score] if min_score is not None else scored
    visible_candidates = [classify_visibility(job) for job in deduplicate(candidates)]
    radar_candidates = [
        job for job in visible_candidates
        if job.display_tier in {"strong", "watchlist"}
        and visible_for_preferences(job, area_preferences)
    ]
    strong_candidates = [job for job in radar_candidates if job.display_tier == "strong"]
    export_jobs(radar_candidates, output_dir)

    # O backend recebe todas as origens; CSV, XLSX e avisos usam a cópia deduplicada.
    upserted, new_strong_urls = (0, set()) if dry_run else await send_to_api(candidates, source_summary)
    api_configured = bool(os.getenv("JOBS_API_URL") and os.getenv("INGEST_API_KEY"))
    notification_jobs = (
        [job for job in strong_candidates if str(job.source_url) in new_strong_urls]
        if api_configured else strong_candidates
    )
    strong_attachments = export_jobs(notification_jobs, output_dir, "vagas-fortes")
    email_sent, telegram_sent = await asyncio.gather(
        send_email(notification_jobs, strong_attachments)
        if not dry_run and notification_jobs else asyncio.sleep(0, result=False),
        send_telegram(notification_jobs)
        if not dry_run and notification_jobs else asyncio.sleep(0, result=False),
    )
    log.info(
        "Found=%d accepted=%d api=%d email=%s telegram=%s",
        len(raw_jobs),
        len(radar_candidates),
        upserted,
        email_sent,
        telegram_sent,
    )
    return 0


def _run_parser(arguments: list[str]) -> None:
    parser = argparse.ArgumentParser(description="Pipeline de vagas de estágio")
    parser.add_argument("--config", default="config/sources.yml")
    parser.add_argument("--output", default="exports")
    parser.add_argument("--min-score", type=int)
    parser.add_argument("--mode", choices=("public",), help=argparse.SUPPRESS)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args(arguments)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    if not args.verbose:
        for noisy_logger in ("primp", "httpx", "httpcore", "hpack", "h2", "rustls"):
            logging.getLogger(noisy_logger).setLevel(logging.WARNING)
    raise SystemExit(asyncio.run(run(args.config, args.output, args.min_score, args.dry_run)))


def cli() -> None:
    load_env_files()
    arguments = sys.argv[1:]
    if arguments[:1] == ["run"]:
        arguments = arguments[1:]
    _run_parser(arguments)


if __name__ == "__main__":
    cli()
