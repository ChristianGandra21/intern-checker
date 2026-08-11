import { NextRequest, NextResponse } from "next/server";
import { hasSameOrigin } from "@/lib/admin";
import { getOptionalUser } from "@/lib/auth";
import { queueDeadlineReminders } from "@/lib/notifications";
import { getSupabaseAdmin, hasDatabaseConfig } from "@/lib/supabase";

const unauthorized = () => NextResponse.json({ error: "Faça login para acessar os alertas." }, { status: 401 });

export async function GET() {
  const user = await getOptionalUser();
  if (!user) return unauthorized();
  if (!hasDatabaseConfig()) return NextResponse.json({ error: "Banco não configurado." }, { status: 503 });
  const db = getSupabaseAdmin();
  await queueDeadlineReminders(db, user.id);
  const [events, preferences, searches] = await Promise.all([
    db.from("notification_events").select("*").eq("user_id", user.id).neq("status", "dismissed").order("created_at", { ascending: false }).limit(100),
    db.from("notification_preferences").select("*").eq("user_id", user.id).maybeSingle(),
    db.from("saved_searches").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
  ]);
  const error = events.error || preferences.error || searches.error;
  if (error) return NextResponse.json({ error: error.message, hint: "Execute a migration 013." }, { status: 400 });
  return NextResponse.json({
    events: events.data || [], searches: searches.data || [],
    preferences: preferences.data || { user_id: user.id, email_enabled: true, immediate_strong: true, daily_digest: true, deadline_reminders: true, deadline_offsets: [7, 3, 1], timezone: "America/Sao_Paulo", digest_hour: 8 },
  });
}

export async function PUT(request: NextRequest) {
  const user = await getOptionalUser();
  if (!user) return unauthorized();
  if (!hasSameOrigin(request)) return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  const offsets = Array.isArray(body.deadline_offsets) ? body.deadline_offsets.map(Number).filter((value) => [1, 3, 7, 14].includes(value)) : [7, 3, 1];
  const row = {
    user_id: user.id, email_enabled: body.email_enabled === true, immediate_strong: body.immediate_strong === true,
    daily_digest: body.daily_digest === true, deadline_reminders: body.deadline_reminders === true,
    deadline_offsets: offsets.length ? offsets : [7, 3, 1], timezone: "America/Sao_Paulo",
    digest_hour: Math.max(0, Math.min(23, Math.trunc(Number(body.digest_hour) || 8))),
  };
  const result = await getSupabaseAdmin().from("notification_preferences").upsert(row, { onConflict: "user_id" }).select("*").single();
  if (result.error) return NextResponse.json({ error: result.error.message, hint: "Execute a migration 013." }, { status: 400 });
  return NextResponse.json({ preferences: result.data });
}

export async function PATCH(request: NextRequest) {
  const user = await getOptionalUser();
  if (!user) return unauthorized();
  if (!hasSameOrigin(request)) return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  const result = await getSupabaseAdmin().from("notification_events").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  return NextResponse.json({ read: true });
}
