import { NextRequest, NextResponse } from "next/server";
import { hasSameOrigin } from "@/lib/admin";
import { getOptionalUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getOptionalUser();
  if (!user) return NextResponse.json({ error: "Faça login." }, { status: 401 });
  if (!hasSameOrigin(request)) return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { dismissed?: unknown };
  const { id } = await context.params;
  const update = body.dismissed === true ? { status: "dismissed", read_at: new Date().toISOString() } : { read_at: new Date().toISOString() };
  const result = await getSupabaseAdmin().from("notification_events").update(update).eq("id", id).eq("user_id", user.id).select("*").maybeSingle();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  if (!result.data) return NextResponse.json({ error: "Alerta não encontrado." }, { status: 404 });
  return NextResponse.json({ event: result.data });
}
