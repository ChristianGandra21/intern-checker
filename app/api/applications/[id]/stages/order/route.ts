import { NextRequest, NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getOptionalUser();
  if (!user) return NextResponse.json({ error: "Faça login." }, { status: 401 });
  const { id } = await context.params;
  const db = getSupabaseAdmin();
  const application = await db.from("tracked_applications").select("id").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!application.data) return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 });
  const body = await request.json().catch(() => null) as { ids?: unknown } | null;
  if (!Array.isArray(body?.ids) || body.ids.some((value) => typeof value !== "string")) return NextResponse.json({ error: "Envie ids válidos." }, { status: 400 });
  const existing = await db.from("application_stages").select("id").eq("application_id", id);
  const currentIds = new Set((existing.data || []).map((stage) => stage.id));
  const ids = body.ids as string[];
  if (ids.length !== currentIds.size || new Set(ids).size !== ids.length || ids.some((stageId) => !currentIds.has(stageId))) return NextResponse.json({ error: "A ordem deve conter todas as etapas uma única vez." }, { status: 400 });

  // Usa posições temporárias para não colidir com a restrição unique durante a troca.
  for (let index = 0; index < ids.length; index += 1) {
    const temporary = await db.from("application_stages").update({ position: 10000 + index }).eq("id", ids[index]).eq("application_id", id);
    if (temporary.error) return NextResponse.json({ error: temporary.error.message }, { status: 400 });
  }
  for (let index = 0; index < ids.length; index += 1) {
    const update = await db.from("application_stages").update({ position: index }).eq("id", ids[index]).eq("application_id", id);
    if (update.error) return NextResponse.json({ error: update.error.message }, { status: 400 });
  }
  return NextResponse.json({ ids });
}
