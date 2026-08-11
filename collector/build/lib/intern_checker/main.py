from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
import time
from collections import Counter
from pathlib import Path

import yaml

from .api import IngestionResult, fetch_area_preferences, fetch_registered_sources, send_to_api
from .dedup import deduplicate
from .enrich import enrich_candidates
from .env import load_env_files
from .exporters import export_jobs
from .normalize import normalize_job
from .notify import send_email, send_telegram
from .preferences import visible_for_preferences
from .prefilter import keep_before_enrichment
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
    notifications: bool = True,
) -> int:
    started = time.perf_counter()
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
    source_timeout = int(config.get("pipeline", {}).get("source_timeout_seconds", 90))
    source_durations: dict[str, int] = {}

    async def timed_collect(label: str, operation):
        source_started = time.perf_counter()
        try:
            values = await asyncio.wait_for(operation, timeout=source_timeout)
            duration = int((time.perf_counter() - source_started) * 1000)
            for source in {job.source for job in values} or {label}:
                source_durations[source] = max(source_durations.get(source, 0), duration)
            log.info("Source %s complete: found=%d duration=%.1fs", label, len(values), duration / 1000)
            return values
        except Exception:  # collectors normally isolate their own failures
            source_durations[label] = int((time.perf_counter() - source_started) * 1000)
            log.exception("Source %s failed", label)
            return []

    log.info("Stage 1/5: collecting configured sources")
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
        timed_collect("Planilha comunitária", collect_community_sheets(config.get("community_sheet", {}))),
        timed_collect("Buscas dirigidas", collect_searches(
            config.get("searches", []),
            int(search_config.get("max_results", 12)),
            int(search_config.get("concurrency", 4)),
            search_config.get("region", "br-pt"),
            search_config.get("timelimit", "m"),
            search_config.get("backend", "duckduckgo,brave,yandex"),
            int(search_config.get("timeout", 8)),
        )),
        timed_collect("RSS", collect_feeds(config.get("feeds", []))),
        timed_collect("Carreiras", collect_career_pages(config.get("companies", []))),
        timed_collect("Portais públicos", collect_public_pages(
            config.get("public_pages", []), int(config.get("pages", {}).get("concurrency", 5))
        )),
        timed_collect("Portais renderizados", collect_rendered_pages(
            rendered_config.get("pages", []), int(rendered_config.get("concurrency", 2))
        )),
        timed_collect("Redes sociais", collect_social_sources(
            config.get("social", {}), int(config.get("social", {}).get("concurrency", 6))
        )),
        timed_collect("Google Alerts", collect_google_alerts(config.get("google_alerts"))),
        timed_collect("ATS", collect_ats_sources(ats_sources, int(config.get("ats", {}).get("concurrency", 4)))),
    )
    # A ordem define a prioridade do orçamento de enriquecimento.
    raw_jobs = [
        *ats_jobs,
        *sheet_jobs,
        *career_jobs,
        *page_jobs,
        *rendered_jobs,
        *rss_jobs,
        *alert_jobs,
        *search_jobs,
        *social_jobs,
    ]
    log.info("Stage 1/5 complete: %d candidates collected", len(raw_jobs))
    for job in raw_jobs:
        if job.source_type == "discovery":
            job.source_type = SOURCE_TYPES.get(job.source, "aggregator")  # type: ignore[assignment]
    collected_count = len(raw_jobs)
    enrichment_jobs = [job for job in raw_jobs if keep_before_enrichment(job)]
    audit_only_jobs = [job for job in raw_jobs if not keep_before_enrichment(job)]
    for job in audit_only_jobs:
        job.raw_payload["_prefiltered"] = True
        job.raw_payload["_prefilter_reason"] = "sem sinais mínimos; preservada para auditoria"
    log.info(
        "Pre-filter complete: collected=%d kept=%d hidden_before_enrichment=%d",
        collected_count,
        len(enrichment_jobs),
        len(audit_only_jobs),
    )
    enrichment = config.get("enrichment", {})
    log.info("Stage 2/5: enriching up to %d unique URLs", int(enrichment.get("limit", 250)))
    enrichment_started = time.perf_counter()
    try:
        enriched_jobs = await asyncio.wait_for(
            enrich_candidates(
                enrichment_jobs,
                int(enrichment.get("concurrency", 10)),
                int(enrichment.get("limit", 250)),
                int(enrichment.get("timeout_seconds", 20)),
            ),
            timeout=int(enrichment.get("stage_timeout_seconds", 150)),
        )
    except TimeoutError:
        log.warning("Enrichment stage timed out; preserving %d candidates without resolution", len(enrichment_jobs))
        enriched_jobs = enrichment_jobs
        for job in enriched_jobs:
            job.raw_payload["_enrichment_timeout"] = True
    raw_jobs = [*enriched_jobs, *audit_only_jobs]
    log.info("Stage 2/5 complete: enrichment finished in %.1fs", time.perf_counter() - enrichment_started)
    source_summary = dict(Counter(job.source for job in raw_jobs))
    log.info(
        "Source yield: %s",
        "; ".join(f"{source}={count}" for source, count in sorted(source_summary.items(), key=lambda item: (-item[1], item[0]))),
    )
    zero_yield = sorted(source for source in source_durations if source not in source_summary)
    if zero_yield:
        log.info("Blocked or zero-yield sources: %s", ", ".join(zero_yield))
    scored = [score_job(normalize_job(job)) for job in raw_jobs]
    candidates = [job for job in scored if job.score >= min_score] if min_score is not None else scored
    log.info("Stage 3/5: deduplicating %d candidates", len(candidates))
    visible_candidates = [classify_visibility(job) for job in deduplicate(candidates)]
    log.info("Stage 3/5 complete: %d unique opportunities", len(visible_candidates))
    # O backend recebe todas as origens e devolve a decisão autoritativa por URL.
    log.info("Stage 4/5: ingesting %d candidates", len(candidates))
    api_configured = bool(os.getenv("JOBS_API_URL") and os.getenv("INGEST_API_KEY"))
    ingestion = IngestionResult() if dry_run else await send_to_api(candidates, source_summary, source_durations)
    if api_configured and not dry_run:
        for job in visible_candidates:
            outcome = ingestion.outcomes.get(str(job.source_url))
            if not outcome:
                job.display_tier = "hidden"
                job.display_reasons = ["decisão do backend não retornada para esta URL"]
                continue
            job.display_tier = outcome.get("display_tier", "hidden")
            job.display_reasons = list(outcome.get("display_reasons", []))
            job.classification_version = "radar-v2-news-leads"
    radar_candidates = [
        job for job in visible_candidates
        if job.display_tier in {"strong", "watchlist"}
        and visible_for_preferences(job, area_preferences)
    ]
    strong_candidates = [job for job in radar_candidates if job.display_tier == "strong"]
    export_jobs(radar_candidates, output_dir)
    log.info(
        "Stage 4/5 complete: run=%s persisted=%d new=%d updated=%d duplicates=%d strong=%d review=%d hidden=%d",
        ingestion.run_id,
        ingestion.persisted,
        ingestion.totals.get("created", 0),
        ingestion.totals.get("updated", 0),
        ingestion.totals.get("duplicates", 0),
        ingestion.totals.get("accepted", 0),
        ingestion.totals.get("review", 0),
        ingestion.totals.get("hidden", 0),
    )
    discard_reasons = Counter(
        reason for outcome in ingestion.outcomes.values()
        if outcome.get("display_tier") == "hidden"
        for reason in outcome.get("display_reasons", [])
    )
    if discard_reasons:
        log.info("Top discard reasons: %s", "; ".join(f"{reason}={count}" for reason, count in discard_reasons.most_common(5)))
    notification_jobs = (
        [job for job in strong_candidates if str(job.source_url) in ingestion.new_strong_urls]
        if api_configured else strong_candidates
    )
    strong_attachments = export_jobs(notification_jobs, output_dir, "vagas-fortes")
    email_sent, telegram_sent = await asyncio.gather(
        send_email(notification_jobs, strong_attachments)
        if notifications and not dry_run and notification_jobs else asyncio.sleep(0, result=False),
        send_telegram(notification_jobs)
        if notifications and not dry_run and notification_jobs else asyncio.sleep(0, result=False),
    )
    log.info("Stage 5/5 complete: exports and notifications finished")
    log.info(
        "Found=%d accepted=%d api=%d email=%s telegram=%s",
        len(raw_jobs),
        len(radar_candidates),
        ingestion.persisted,
        email_sent,
        telegram_sent,
    )
    log.info("Pipeline completed in %.1fs", time.perf_counter() - started)
    return 0


def _run_parser(arguments: list[str]) -> None:
    parser = argparse.ArgumentParser(description="Pipeline de vagas de estágio")
    parser.add_argument("--config", default="config/sources.yml")
    parser.add_argument("--output", default="exports")
    parser.add_argument("--min-score", type=int)
    parser.add_argument("--mode", choices=("public",), help=argparse.SUPPRESS)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--no-notify", action="store_true", help="não envia e-mail ou Telegram neste ciclo")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args(arguments)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    if not args.verbose:
        for noisy_logger in ("primp", "httpx", "httpcore", "hpack", "h2", "rustls"):
            logging.getLogger(noisy_logger).setLevel(logging.WARNING)
    raise SystemExit(asyncio.run(run(args.config, args.output, args.min_score, args.dry_run, not args.no_notify)))


def cli() -> None:
    load_env_files()
    arguments = sys.argv[1:]
    if arguments[:1] == ["run"]:
        arguments = arguments[1:]
    _run_parser(arguments)


if __name__ == "__main__":
    cli()
