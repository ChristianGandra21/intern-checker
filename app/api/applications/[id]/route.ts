import { NextRequest, NextResponse } from "next/server";
import { applicationStates, applicationStatuses, cleanText, optionalDate, validHttpUrl, workModes } from "@/lib/applications";
import { getOptionalUser } from "@/lib/auth";
import { hasSameOrigin } from "@/lib/admin";
import { calculateDecisionPriorityScore, normalizeDecisionPriorityCriteria } from "@/lib/application-priority";
import { getSupabaseAdmin, hasDatabaseConfig } from "@/lib/supabase";
import type { ApplicationState, ApplicationStatus, WorkMode } from "@/lib/types";

const unauthorized = () => NextResponse.json({ error: "Faça login para acessar suas vagas." }, { status: 401 });

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getOptionalUser();
  if (!user) return unauthorized();
  const { id } = await context.params;
  const result = await getSupabaseAdmin().from("tracked_applications").select("*,application_stages(*),application_recommendations(*),jobs(source)").eq("id", id).eq("user_id", user.id).is("deleted_at", null).maybeSingle();
  if (result.error) {
    const migration = /decision_priority_/i.test(result.error.message) ? " Execute a migration 014."
      : /company_context|company_culture|company_reviews|application_resume_text|candidate_pitch/i.test(result.error.message) ? " Execute a migration 015." : "";
    return NextResponse.json({ error: `${result.error.message}${migration}` }, { status: 400 });
  }
  if (!result.data) return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 });
  return NextResponse.json({ application: result.data });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getOptionalUser();
  if (!user) return unauthorized();
  if (!hasSameOrigin(request)) return NextResponse.json({ error: "Origem da requisição inválida." }, { status: 403 });
  if (!hasDatabaseConfig()) return NextResponse.json({ error: "Banco não configurado." }, { status: 503 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  const update: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!applicationStatuses.has(body.status as ApplicationStatus)) return NextResponse.json({ error: "Status inválido." }, { status: 400 });
    update.status = body.status;
  }
  if (body.application_state !== undefined) {
    if (!applicationStates.has(body.application_state as ApplicationState)) return NextResponse.json({ error: "Situação inválida." }, { status: 400 });
    update.application_state = body.application_state;
    if (body.application_state === "applied") update.status = "active";
    if (body.application_state === "accepted") update.status = "offer";
    if (body.application_state === "rejected") update.status = "rejected";
    if (body.application_state === "not_applied" && !body.status) update.status = "saved";
  }
  for (const [key, max] of [["title", 240], ["company", 200], ["location", 240], ["description", 10000], ["notes", 10000], ["rejection_reason", 240], ["company_context", 12000], ["company_culture", 8000], ["company_reviews", 12000], ["application_resume_text", 30000], ["candidate_pitch", 6000]] as const) {
    if (body[key] !== undefined) update[key] = cleanText(body[key], max);
  }
  if (body.source_url !== undefined) {
    const url = cleanText(body.source_url, 2000);
    if (!validHttpUrl(url)) return NextResponse.json({ error: "URL inválida." }, { status: 400 });
    update.source_url = url;
  }
  if (body.work_mode !== undefined) {
    if (!workModes.has(body.work_mode as WorkMode)) return NextResponse.json({ error: "Modalidade inválida." }, { status: 400 });
    update.work_mode = body.work_mode;
  }
  if (body.application_deadline !== undefined) {
    const date = optionalDate(body.application_deadline);
    if (date === undefined) return NextResponse.json({ error: "Prazo inválido." }, { status: 400 });
    update.application_deadline = date;
  }
  if (body.priority !== undefined) update.priority = Math.min(3, Math.max(0, Number(body.priority) || 0));
  if (body.decision_priority_enabled !== undefined || body.decision_priority_criteria !== undefined) {
    const enabled = body.decision_priority_enabled === true;
    const criteria = enabled ? normalizeDecisionPriorityCriteria(body.decision_priority_criteria) : {};
    update.decision_priority_enabled = enabled;
    update.decision_priority_criteria = criteria;
    update.decision_priority_score = enabled ? calculateDecisionPriorityScore(criteria) : null;
  }
  const result = await getSupabaseAdmin().from("tracked_applications").update(update).eq("id", id).eq("user_id", user.id).select("*").maybeSingle();
  if (result.error) {
    const migration = /decision_priority_/i.test(result.error.message) ? " Execute a migration 014."
      : /company_context|company_culture|company_reviews|application_resume_text|candidate_pitch/i.test(result.error.message) ? " Execute a migration 015." : "";
    return NextResponse.json({ error: `${result.error.message}${migration}` }, { status: 400 });
  }
  if (!result.data) return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 });
  return NextResponse.json({ application: result.data });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getOptionalUser();
  if (!user) return unauthorized();
  if (!hasSameOrigin(request)) return NextResponse.json({ error: "Origem da requisição inválida." }, { status: 403 });
  const { id } = await context.params;
  const permanent = request.nextUrl.searchParams.get("permanent") === "true";
  const db = getSupabaseAdmin();
  if (permanent) {
    const result = await db.from("tracked_applications").delete().eq("id", id).eq("user_id", user.id).not("deleted_at", "is", null).select("id").maybeSingle();
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
    if (!result.data) return NextResponse.json({ error: "A vaga precisa estar na lixeira antes da exclusão permanente." }, { status: 409 });
    return NextResponse.json({ deleted: true, permanent: true });
  }
  const result = await db.from("tracked_applications").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id).is("deleted_at", null).select("id").maybeSingle();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  if (!result.data) return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 });
  return NextResponse.json({ deleted: true, permanent: false });
}
