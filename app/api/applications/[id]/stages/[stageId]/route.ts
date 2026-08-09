import { NextRequest, NextResponse } from "next/server";
import { cleanText, optionalDate, stageStates } from "@/lib/applications";
import { getOptionalUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { StageState } from "@/lib/types";

async function ownedStage(applicationId: string, stageId: string, userId: string) {
  const db = getSupabaseAdmin();
  const application = await db.from("tracked_applications").select("id").eq("id", applicationId).eq("user_id", userId).maybeSingle();
  if (!application.data) return null;
  const stage = await db.from("application_stages").select("*").eq("id", stageId).eq("application_id", applicationId).maybeSingle();
  return stage.data;
}

async function advance(applicationId: string, afterPosition: number) {
  const db = getSupabaseAdmin();
  const next = await db.from("application_stages").select("id").eq("application_id", applicationId).eq("state", "pending").gt("position", afterPosition).order("position").limit(1).maybeSingle();
  if (next.data) await db.from("application_stages").update({ state: "current" }).eq("id", next.data.id);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; stageId: string }> }) {
  const user = await getOptionalUser();
  if (!user) return NextResponse.json({ error: "Faça login." }, { status: 401 });
  const { id, stageId } = await context.params;
  const current = await ownedStage(id, stageId, user.id);
  if (!current) return NextResponse.json({ error: "Etapa não encontrada." }, { status: 404 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  const update: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = cleanText(body.name, 160);
    if (!name) return NextResponse.json({ error: "Nome inválido." }, { status: 400 });
    update.name = name;
  }
  if (body.notes !== undefined) update.notes = cleanText(body.notes, 5000);
  for (const key of ["scheduled_at", "completed_at"] as const) {
    if (body[key] !== undefined) {
      const date = optionalDate(body[key]);
      if (date === undefined) return NextResponse.json({ error: "Data inválida." }, { status: 400 });
      update[key] = date;
    }
  }
  let nextState: StageState | undefined;
  if (body.state !== undefined) {
    if (!stageStates.has(body.state as StageState)) return NextResponse.json({ error: "Estado inválido." }, { status: 400 });
    nextState = body.state as StageState;
    update.state = nextState;
    if (nextState === "completed" && body.completed_at === undefined) update.completed_at = new Date().toISOString();
  }
  const db = getSupabaseAdmin();
  if (nextState === "current") await db.from("application_stages").update({ state: "pending" }).eq("application_id", id).eq("state", "current").neq("id", stageId);
  const result = await db.from("application_stages").update(update).eq("id", stageId).eq("application_id", id).select("*").single();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  if (nextState === "completed") {
    if (current.state === "current") await advance(id, current.position);
    if (current.milestone === "application_submitted") {
      await db.from("tracked_applications").update({ status: "active", application_state: "applied" })
        .eq("id", id).eq("user_id", user.id).eq("application_state", "not_applied");
    }
  }
  return NextResponse.json({ stage: result.data });
}

export async function DELETE(_: NextRequest, context: { params: Promise<{ id: string; stageId: string }> }) {
  const user = await getOptionalUser();
  if (!user) return NextResponse.json({ error: "Faça login." }, { status: 401 });
  const { id, stageId } = await context.params;
  const current = await ownedStage(id, stageId, user.id);
  if (!current) return NextResponse.json({ error: "Etapa não encontrada." }, { status: 404 });
  const db = getSupabaseAdmin();
  const removed = await db.from("application_stages").delete().eq("id", stageId).eq("application_id", id);
  if (removed.error) return NextResponse.json({ error: removed.error.message }, { status: 400 });
  if (current.state === "current") await advance(id, current.position);
  return NextResponse.json({ deleted: true });
}
