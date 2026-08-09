import { NextRequest, NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { hasSameOrigin } from "@/lib/admin";
import { getSupabaseAdmin, hasDatabaseConfig } from "@/lib/supabase";

const unauthorized = () => NextResponse.json({ error: "Faça login para organizar seu radar." }, { status: 401 });

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getOptionalUser();
  if (!user) return unauthorized();
  if (!hasSameOrigin(request)) return NextResponse.json({ error: "Origem da requisição inválida." }, { status: 403 });
  if (!hasDatabaseConfig()) return NextResponse.json({ error: "Banco não configurado." }, { status: 503 });
  const { id } = await context.params;
  const body = await request.json().catch(() => ({})) as { reason?: unknown };
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  const db = getSupabaseAdmin();
  const job = await db.from("jobs").select("id").eq("id", id).maybeSingle();
  if (!job.data) return NextResponse.json({ error: "Vaga não encontrada." }, { status: 404 });
  const result = await db.from("user_job_decisions").upsert({ user_id: user.id, job_id: id, decision: "declined", reason }, { onConflict: "user_id,job_id" }).select("*").single();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  return NextResponse.json({ decision: result.data });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getOptionalUser();
  if (!user) return unauthorized();
  if (!hasSameOrigin(request)) return NextResponse.json({ error: "Origem da requisição inválida." }, { status: 403 });
  const { id } = await context.params;
  const result = await getSupabaseAdmin().from("user_job_decisions").delete().eq("user_id", user.id).eq("job_id", id);
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  return NextResponse.json({ restored: true });
}
