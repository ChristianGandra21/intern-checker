import { NextRequest, NextResponse } from "next/server";
import { hasSameOrigin, isScrapingAdmin } from "@/lib/admin";
import { getOptionalUser } from "@/lib/auth";
import { getSupabaseAdmin, hasDatabaseConfig } from "@/lib/supabase";
import type { DisplayTier, EvidenceFit, WorkMode } from "@/lib/types";

const tiers = new Set<DisplayTier>(["strong", "watchlist", "hidden"]);
const kinds = new Set(["job", "lead", "noise"]);
const fits = new Set<EvidenceFit>(["confirmed", "probable", "unknown", "incompatible"]);
const modes = new Set<WorkMode>(["remote", "hybrid", "onsite", "unknown"]);

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getOptionalUser();
  if (!user) return NextResponse.json({ error: "Faça login para revisar vagas." }, { status: 401 });
  if (!isScrapingAdmin(user)) return NextResponse.json({ error: "Revisão restrita a administradores." }, { status: 403 });
  if (!hasSameOrigin(request)) return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  if (!hasDatabaseConfig()) return NextResponse.json({ error: "Banco não configurado." }, { status: 503 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  const { id } = await context.params;
  const db = getSupabaseAdmin();
  const current = await db.from("jobs").select("*").eq("id", id).maybeSingle();
  if (current.error) return NextResponse.json({ error: current.error.message }, { status: 400 });
  if (!current.data) return NextResponse.json({ error: "Vaga não encontrada." }, { status: 404 });

  const tier = typeof body.display_tier === "string" && tiers.has(body.display_tier as DisplayTier) ? body.display_tier as DisplayTier : null;
  const kind = typeof body.candidate_kind === "string" && kinds.has(body.candidate_kind) ? body.candidate_kind : null;
  if (!tier || !kind) return NextResponse.json({ error: "Tipo e visibilidade são obrigatórios." }, { status: 400 });
  const corrected: Record<string, unknown> = {};
  for (const [field, max] of [["title", 300], ["company", 200], ["location", 240]] as const) {
    if (typeof body[field] === "string") corrected[field] = body[field].trim().slice(0, max);
  }
  if (typeof body.work_mode === "string" && modes.has(body.work_mode as WorkMode)) corrected.work_mode = body.work_mode;
  if (typeof body.target_fit === "string" && fits.has(body.target_fit as EvidenceFit)) corrected.target_fit = body.target_fit;
  if (typeof body.location_fit === "string" && fits.has(body.location_fit as EvidenceFit)) corrected.location_fit = body.location_fit;
  if (body.application_deadline === null || body.application_deadline === "") corrected.application_deadline = null;
  else if (typeof body.application_deadline === "string" && Number.isFinite(Date.parse(body.application_deadline))) corrected.application_deadline = new Date(body.application_deadline).toISOString();
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : "";
  if (!reason) return NextResponse.json({ error: "Informe o motivo da correção." }, { status: 400 });

  const now = new Date().toISOString();
  const moderation = await db.from("job_moderations").upsert({
    job_id: id, identity_key: current.data.identity_key, override_display_tier: tier,
    override_candidate_kind: kind, corrected_fields: corrected, reason, fixture_status: "pending", created_by: user.id,
  }, { onConflict: "job_id" });
  if (moderation.error) return NextResponse.json({ error: moderation.error.message, hint: "Execute a migration 013." }, { status: 400 });
  const update = {
    ...corrected, display_tier: tier, candidate_kind: kind,
    validation_status: tier === "strong" ? "accepted" : tier === "watchlist" ? "review" : "rejected",
    verification_level: tier === "strong" ? "probable" : tier === "watchlist" ? "review" : "rejected",
    manual_display_tier: tier, manual_candidate_kind: kind, manual_fields: corrected, moderated_at: now,
    display_reasons: ["classificação administrativa", reason],
  };
  const saved = await db.from("jobs").update(update).eq("id", id).select("*").single();
  if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 400 });
  await db.from("job_review_events").insert({
    job_id: id, ingestion_run_id: typeof body.ingestion_run_id === "string" ? body.ingestion_run_id : null,
    reviewed_by: user.id,
    previous_values: { title: current.data.title, company: current.data.company, location: current.data.location, work_mode: current.data.work_mode, display_tier: current.data.display_tier, candidate_kind: current.data.candidate_kind, target_fit: current.data.target_fit, location_fit: current.data.location_fit },
    next_values: update, reason,
  });
  return NextResponse.json({ job: saved.data });
}
