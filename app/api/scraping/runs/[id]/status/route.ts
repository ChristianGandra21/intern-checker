import { NextRequest, NextResponse } from "next/server";
import { validIngestKey } from "@/lib/ingest-auth";
import { getSupabaseAdmin, hasDatabaseConfig } from "@/lib/supabase";
import type { ScrapeRunStatus } from "@/lib/types";

const callbackStatuses = new Set<ScrapeRunStatus>(["running", "succeeded", "failed"]);

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!validIngestKey(request.headers.get("x-ingest-key"))) return NextResponse.json({ error: "Chave de ingestão inválida." }, { status: 401 });
  if (!hasDatabaseConfig()) return NextResponse.json({ error: "Banco não configurado." }, { status: 503 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Callback inválido." }, { status: 400 });
  const status = body.status as ScrapeRunStatus | undefined;
  if (!status || !callbackStatuses.has(status)) return NextResponse.json({ error: "Status de callback inválido." }, { status: 400 });

  const db = getSupabaseAdmin();
  const current = await db.from("scrape_runs").select("id,status,runner").eq("id", id).maybeSingle();
  if (current.error) return NextResponse.json({ error: current.error.message }, { status: 400 });
  if (!current.data || current.data.runner !== "github") return NextResponse.json({ error: "Execução remota não encontrada." }, { status: 404 });
  if (current.data.status === status) return NextResponse.json({ run: current.data, repeated: true });
  const allowed = current.data.status === "queued" ? new Set(["running", "failed"]) : current.data.status === "running" ? new Set(["succeeded", "failed"]) : new Set<string>();
  if (!allowed.has(status)) return NextResponse.json({ error: `Transição ${current.data.status} → ${status} não permitida.` }, { status: 409 });

  const update: Record<string, unknown> = { status };
  if (status === "running") {
    update.started_at = new Date().toISOString();
    update.error_message = null;
  } else {
    update.finished_at = new Date().toISOString();
    update.exit_code = status === "succeeded" ? 0 : Math.max(1, Number(body.exit_code) || 1);
    update.summary = typeof body.summary === "string" ? body.summary.slice(-4000) : "";
    update.error_message = status === "failed" ? String(body.error_message || "A execução remota falhou.").slice(0, 1000) : null;
  }
  if (typeof body.external_run_id === "string") update.external_run_id = body.external_run_id.slice(0, 120);
  if (typeof body.external_url === "string" && /^https:\/\/github\.com\//.test(body.external_url)) update.external_url = body.external_url.slice(0, 2000);

  const result = await db.from("scrape_runs").update(update).eq("id", id).eq("status", current.data.status).select("*").maybeSingle();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  if (!result.data) return NextResponse.json({ error: "A execução mudou durante o callback." }, { status: 409 });
  return NextResponse.json({ run: result.data });
}
