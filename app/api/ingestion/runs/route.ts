import { NextRequest, NextResponse } from "next/server";
import { validIngestKey } from "@/lib/ingest-auth";
import { getSupabaseAdmin, hasDatabaseConfig } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!validIngestKey(request.headers.get("x-ingest-key"))) return NextResponse.json({ error: "Chave de ingestão inválida." }, { status: 401 });
  if (!hasDatabaseConfig()) return NextResponse.json({ error: "Banco não configurado." }, { status: 503 });
  const body = await request.json().catch(() => ({})) as { found_count?: unknown; source_summary?: unknown };
  const sourceSummary = body.source_summary && typeof body.source_summary === "object" ? body.source_summary : {};
  const db = getSupabaseAdmin();
  const schema = await db.from("ingestion_runs").select("persisted_count,review_count,rejected_count,hidden_count,resolved_count,failure_count,duration_ms").limit(1);
  if (schema.error) return NextResponse.json({ error: "Telemetria de ingestão indisponível. Execute a migration 012.", detail: schema.error.message }, { status: 409 });
  const result = await db.from("ingestion_runs").insert({
    status: "running",
    found_count: Math.max(0, Number(body.found_count) || 0),
    source_summary: sourceSummary,
  }).select("id,started_at").single();
  if (result.error) return NextResponse.json({ error: result.error.message, hint: "Execute a migration 012." }, { status: 400 });
  return NextResponse.json({ run_id: result.data.id, started_at: result.data.started_at }, { status: 201 });
}
