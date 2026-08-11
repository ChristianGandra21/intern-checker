import { NextRequest, NextResponse } from "next/server";
import { defaultStages, cleanText, optionalDate, validHttpUrl, workModes } from "@/lib/applications";
import { getOptionalUser } from "@/lib/auth";
import { getSupabaseAdmin, hasDatabaseConfig } from "@/lib/supabase";
import type { TrackedApplication, WorkMode } from "@/lib/types";

const unauthorized = () => NextResponse.json({ error: "Faça login para acessar suas vagas." }, { status: 401 });

export async function GET(request: NextRequest) {
  const user = await getOptionalUser();
  if (!user) return unauthorized();
  if (!hasDatabaseConfig()) return NextResponse.json({ error: "Banco não configurado." }, { status: 503 });
  const pageSize = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("page_size")) || 20));
  const requestedPage = Math.max(1, Number(request.nextUrl.searchParams.get("page")) || 1);
  const view = request.nextUrl.searchParams.get("view") === "trash" ? "trash" : "active";
  const applicationState = request.nextUrl.searchParams.get("application_state");
  const db = getSupabaseAdmin();
  await db.rpc("purge_expired_tracked_applications");
  let query = db.from("tracked_applications").select("*,application_stages(*)", { count: "exact" })
    .eq("user_id", user.id).order("updated_at", { ascending: false });
  query = query.neq("status", "archived");
  query = view === "trash" ? query.not("deleted_at", "is", null) : query.is("deleted_at", null);
  if (applicationState) query = query.eq("application_state", applicationState);
  const countResult = await query.range((requestedPage - 1) * pageSize, requestedPage * pageSize - 1);
  if (countResult.error) return NextResponse.json({ error: countResult.error.message }, { status: 400 });
  const total = countResult.count || 0;
  return NextResponse.json({ applications: countResult.data || [], total, page: requestedPage, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)), view });
}

export async function POST(request: NextRequest) {
  const user = await getOptionalUser();
  if (!user) return unauthorized();
  if (!hasDatabaseConfig()) return NextResponse.json({ error: "Banco não configurado." }, { status: 503 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  const db = getSupabaseAdmin();

  let payload: Omit<TrackedApplication, "id" | "created_at" | "updated_at" | "application_stages">;
  const jobId = cleanText(body.job_id, 80) || null;
  if (jobId) {
    const existing = await db.from("tracked_applications").select("id,deleted_at").eq("user_id", user.id).eq("job_id", jobId).maybeSingle();
    if (existing.data) {
      if (existing.data.deleted_at) await db.from("tracked_applications").update({ deleted_at: null }).eq("id", existing.data.id).eq("user_id", user.id);
      return NextResponse.json({ application: { ...existing.data, deleted_at: null }, existing: true, restored: Boolean(existing.data.deleted_at) });
    }
    const result = await db.from("jobs").select("id,title,company,description,location,work_mode,source_url,official_url,application_url,application_deadline").eq("id", jobId).maybeSingle();
    if (result.error || !result.data) return NextResponse.json({ error: "Vaga não encontrada." }, { status: 404 });
    const job = result.data;
    payload = { user_id: user.id, job_id: job.id, title: job.title, company: job.company, description: job.description, location: job.location, work_mode: job.work_mode, source_url: job.application_url || job.official_url || job.source_url, application_deadline: job.application_deadline, notes: "", rejection_reason: "", priority: 1, status: "saved", application_state: "not_applied", deleted_at: null };
  } else {
    const title = cleanText(body.title, 240);
    const company = cleanText(body.company, 200);
    const sourceUrl = cleanText(body.source_url, 2000);
    if (!title || !company || !validHttpUrl(sourceUrl)) return NextResponse.json({ error: "Informe título, empresa e uma URL http(s) válida." }, { status: 400 });
    const deadline = optionalDate(body.application_deadline);
    if (deadline === undefined) return NextResponse.json({ error: "Prazo inválido." }, { status: 400 });
    const mode = workModes.has(body.work_mode as WorkMode) ? body.work_mode as WorkMode : "unknown";
    payload = { user_id: user.id, job_id: null, title, company, source_url: sourceUrl, location: cleanText(body.location, 240), work_mode: mode, description: cleanText(body.description, 10000), application_deadline: deadline, notes: cleanText(body.notes, 10000), rejection_reason: "", priority: Math.min(3, Math.max(0, Number(body.priority) || 1)), status: "saved", application_state: "not_applied", deleted_at: null };
  }

  const inserted = await db.from("tracked_applications").insert(payload).select("*").single();
  if (inserted.error) return NextResponse.json({ error: inserted.error.message }, { status: 400 });
  const stages = await db.from("application_stages").insert(defaultStages(inserted.data.id)).select("*");
  if (stages.error) {
    await db.from("tracked_applications").delete().eq("id", inserted.data.id).eq("user_id", user.id);
    return NextResponse.json({ error: stages.error.message }, { status: 400 });
  }
  return NextResponse.json({ application: { ...inserted.data, application_stages: stages.data } }, { status: 201 });
}
