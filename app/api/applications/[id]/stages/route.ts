import { NextRequest, NextResponse } from "next/server";
import { cleanText, optionalDate, stageStates } from "@/lib/applications";
import { getOptionalUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { StageState } from "@/lib/types";

async function ownsApplication(id: string, userId: string) {
  const result = await getSupabaseAdmin().from("tracked_applications").select("id").eq("id", id).eq("user_id", userId).maybeSingle();
  return Boolean(result.data);
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getOptionalUser();
  if (!user) return NextResponse.json({ error: "Faça login." }, { status: 401 });
  const { id } = await context.params;
  if (!await ownsApplication(id, user.id)) return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const name = cleanText(body?.name, 160);
  if (!name) return NextResponse.json({ error: "Informe o nome da etapa." }, { status: 400 });
  const db = getSupabaseAdmin();
  const positions = await db.from("application_stages").select("position").eq("application_id", id).order("position", { ascending: false }).limit(1);
  const state = stageStates.has(body?.state as StageState) ? body?.state as StageState : "pending";
  if (state === "current") await db.from("application_stages").update({ state: "pending" }).eq("application_id", id).eq("state", "current");
  const scheduledAt = optionalDate(body?.scheduled_at);
  if (scheduledAt === undefined) return NextResponse.json({ error: "Data prevista inválida." }, { status: 400 });
  const result = await db.from("application_stages").insert({ application_id: id, name, position: (positions.data?.[0]?.position ?? -1) + 1, state, scheduled_at: scheduledAt, notes: cleanText(body?.notes, 5000) }).select("*").single();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  return NextResponse.json({ stage: result.data }, { status: 201 });
}
