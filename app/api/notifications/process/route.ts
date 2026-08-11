import { NextRequest, NextResponse } from "next/server";
import { validIngestKey } from "@/lib/ingest-auth";
import { notificationPreviewMode, queueDeadlineReminders } from "@/lib/notifications";
import { sendSmtpEmail, smtpConfigured } from "@/lib/smtp";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]!);

export async function POST(request: NextRequest) {
  if (!validIngestKey(request.headers.get("x-ingest-key"))) return NextResponse.json({ error: "Chave inválida." }, { status: 401 });
  const db = getSupabaseAdmin();
  const profiles = await db.from("user_profiles").select("user_id").not("user_id", "is", null);
  for (const profile of profiles.data ?? []) if (profile.user_id) await queueDeadlineReminders(db, profile.user_id);
  const preview = notificationPreviewMode();
  const events = await db.from("notification_events").select("*").in("status", preview ? ["preview"] : ["pending", "preview"]).order("created_at").limit(100);
  if (events.error) return NextResponse.json({ error: events.error.message, hint: "Execute a migration 013." }, { status: 400 });
  if (preview || !smtpConfigured()) return NextResponse.json({ preview: true, queued: events.data?.length || 0, message: "Eventos registrados; envio de e-mail ainda não habilitado." });
  const byUser = new Map<string, typeof events.data>();
  for (const event of events.data ?? []) byUser.set(event.user_id, [...(byUser.get(event.user_id) || []), event]);
  let sent = 0; const failures: string[] = [];
  for (const [userId, pendingRows] of byUser) {
    const [authUser, preferences] = await Promise.all([db.auth.admin.getUserById(userId), db.from("notification_preferences").select("email_enabled,daily_digest,digest_hour,timezone").eq("user_id", userId).maybeSingle()]);
    const email = authUser.data.user?.email;
    if (!email || preferences.data?.email_enabled === false) continue;
    const currentHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: preferences.data?.timezone || "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
    const rows = pendingRows.filter((row) => row.event_type !== "job_updated"
      || (preferences.data?.daily_digest !== false && currentHour === Number(preferences.data?.digest_hour ?? 8)));
    if (!rows.length) continue;
    const html = `<h1>Radar de Estágios</h1><p>${rows.length} sinal(is) novo(s) no seu radar:</p><ul>${rows.map((row) => `<li><strong>${escape(row.title)}</strong><br>${escape(row.body)}</li>`).join("")}</ul><p><a href="${escape((process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000") + "/inbox")}">Abrir caixa de entrada</a></p>`;
    try {
      await sendSmtpEmail(email, `Radar de Estágios · ${rows.length} novidade(s)`, html);
      await db.from("notification_events").update({ status: "sent", emailed_at: new Date().toISOString(), error_message: null }).in("id", rows.map((row) => row.id)); sent += rows.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha SMTP"; failures.push(message);
      await db.from("notification_events").update({ status: "failed", error_message: message.slice(0, 1000) }).in("id", rows.map((row) => row.id));
    }
  }
  return NextResponse.json({ preview: false, sent, failures });
}
