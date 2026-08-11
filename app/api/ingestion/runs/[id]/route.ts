import { NextRequest, NextResponse } from "next/server";
import { validIngestKey } from "@/lib/ingest-auth";
import { queueIngestionNotifications } from "@/lib/notifications";
import { getSupabaseAdmin, hasDatabaseConfig } from "@/lib/supabase";

export const runtime = "nodejs";

type SourceTotal = {
  source?: unknown; adapter?: unknown; discovered?: unknown; resolved?: unknown; persisted?: unknown;
  accepted?: unknown; review?: unknown; rejected?: unknown; hidden?: unknown; failures?: unknown; duration_ms?: unknown; error?: unknown;
  created?: unknown; updated?: unknown; duplicates?: unknown;
};

const count = (value: unknown) => Math.max(0, Math.trunc(Number(value) || 0));

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!validIngestKey(request.headers.get("x-ingest-key"))) return NextResponse.json({ error: "Chave de ingestão inválida." }, { status: 401 });
  if (!hasDatabaseConfig()) return NextResponse.json({ error: "Banco não configurado." }, { status: 503 });
  const { id } = await context.params;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const status = body.status === "failed" ? "failed" : body.status === "success" ? "success" : null;
  if (!status) return NextResponse.json({ error: "Status final deve ser success ou failed." }, { status: 400 });
  const db = getSupabaseAdmin();
  const current = await db.from("ingestion_runs").select("id,status,started_at,scrape_run_id").eq("id", id).maybeSingle();
  if (current.error) return NextResponse.json({ error: current.error.message }, { status: 400 });
  if (!current.data) return NextResponse.json({ error: "Execução não encontrada." }, { status: 404 });
  if (current.data.status !== "running") return NextResponse.json({ error: `Transição inválida: ${current.data.status} → ${status}.` }, { status: 409 });
  const startedAt = current.data.started_at;

  const sources = Array.isArray(body.sources) ? body.sources as SourceTotal[] : [];
  const sourceRows = sources.filter((item) => typeof item.source === "string").map((item) => ({
    ingestion_run_id: id,
    source: String(item.source),
    adapter: typeof item.adapter === "string" ? item.adapter : String(item.source).toLowerCase().replaceAll(" ", "_"),
    status: item.error ? "failed" : "success",
    discovered_count: count(item.discovered), resolved_count: count(item.resolved), persisted_count: count(item.persisted),
    accepted_count: count(item.accepted), review_count: count(item.review), rejected_count: count(item.rejected), hidden_count: count(item.hidden),
    failure_count: count(item.failures),
    created_count: count(item.created), updated_count: count(item.updated), duplicate_count: count(item.duplicates),
    strong_count: count(item.accepted), watchlist_count: count(item.review),
    duration_ms: count(item.duration_ms), error_message: typeof item.error === "string" ? item.error.slice(0, 2000) : null,
    finished_at: new Date().toISOString(),
  }));
  if (sourceRows.length) {
    const saved = await db.from("source_runs").upsert(sourceRows, { onConflict: "ingestion_run_id,source" });
    if (saved.error) return NextResponse.json({ error: saved.error.message, stage: "source_runs", hint: "Execute a migration 012." }, { status: 400 });
  }
  const finishedAt = new Date();
  const durationMs = Math.max(0, finishedAt.getTime() - Date.parse(startedAt));
  const touchedBase = () => db.from("jobs").select("id", { count: "exact", head: true }).gte("last_seen_at", startedAt);
  const [createdJobs, updatedJobs, strongJobs, watchlistJobs, hiddenJobs, rawCandidates] = status === "success" ? await Promise.all([
    db.from("jobs").select("id", { count: "exact", head: true }).gte("first_seen_at", startedAt),
    touchedBase().lt("first_seen_at", startedAt),
    touchedBase().eq("display_tier", "strong"),
    touchedBase().eq("display_tier", "watchlist"),
    touchedBase().eq("display_tier", "hidden"),
    db.from("raw_candidates").select("id", { count: "exact", head: true }).eq("run_id", id),
  ]) : [];
  const touchedCount = (createdJobs?.count || 0) + (updatedJobs?.count || 0);
  const totals = {
    persisted_count: count(body.persisted), accepted_count: count(body.accepted), review_count: count(body.review),
    rejected_count: count(body.rejected), resolved_count: count(body.resolved),
    failure_count: count(body.failures),
    created_count: status === "success" ? createdJobs?.count || 0 : count(body.created),
    updated_count: status === "success" ? updatedJobs?.count || 0 : count(body.updated),
    duplicate_count: status === "success" ? Math.max(0, (rawCandidates?.count || 0) - touchedCount) : count(body.duplicates),
    strong_count: status === "success" ? strongJobs?.count || 0 : count(body.accepted),
    watchlist_count: status === "success" ? watchlistJobs?.count || 0 : count(body.review),
    hidden_count: status === "success" ? hiddenJobs?.count || 0 : count(body.hidden),
    status, error_message: status === "failed" ? String(body.error_message || "Falha na ingestão").slice(0, 4000) : null,
    duration_ms: durationMs, finished_at: finishedAt.toISOString(),
  };
  const updated = await db.from("ingestion_runs").update(totals).eq("id", id).eq("status", "running");
  if (updated.error) return NextResponse.json({ error: updated.error.message }, { status: 400 });
  if (status === "success" && (!current.data.scrape_run_id || process.env.MANUAL_ALERTS_ENABLED === "true")) {
    await queueIngestionNotifications(db, startedAt);
  }

  const snapshots = Array.isArray(body.official_snapshots) ? body.official_snapshots : [];
  for (const raw of snapshots) {
    const snapshot = raw as { adapter?: unknown; identifier?: unknown; external_ids?: unknown };
    if (typeof snapshot.adapter !== "string" || typeof snapshot.identifier !== "string" || !Array.isArray(snapshot.external_ids)) continue;
    const seen = new Set(snapshot.external_ids.filter((value): value is string => typeof value === "string"));
    const sourceName = snapshot.adapter[0].toUpperCase() + snapshot.adapter.slice(1);
    const existing = await db.from("jobs").select("id,external_id,missing_runs").eq("source", sourceName).contains("raw_payload", { _registry_identifier: snapshot.identifier }).eq("is_active", true);
    for (const job of existing.data ?? []) {
      if (job.external_id && seen.has(job.external_id)) continue;
      const missingRuns = Number(job.missing_runs || 0) + 1;
      await db.from("jobs").update(missingRuns >= 2
        ? { missing_runs: missingRuns, is_active: false, verification_level: "rejected", validation_status: "rejected", display_tier: "hidden" }
        : { missing_runs: missingRuns }).eq("id", job.id);
    }
  }
  return NextResponse.json({ run_id: id, ...totals });
}
