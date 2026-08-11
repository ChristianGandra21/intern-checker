import { BellRing } from "lucide-react";
import { redirect } from "next/navigation";
import { InboxWorkspace } from "@/components/inbox-workspace";
import { requireUser } from "@/lib/auth";
import { queueDeadlineReminders } from "@/lib/notifications";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { NotificationEvent, NotificationPreferences, SavedSearch } from "@/lib/types";

export default async function InboxPage() {
  const user = await requireUser().catch(() => null);
  if (!user) redirect("/login?next=/inbox");
  const db = getSupabaseAdmin();
  await queueDeadlineReminders(db, user.id);
  const [events, preferences, searches] = await Promise.all([
    db.from("notification_events").select("*").eq("user_id", user.id).neq("status", "dismissed").order("created_at", { ascending: false }).limit(100),
    db.from("notification_preferences").select("*").eq("user_id", user.id).maybeSingle(),
    db.from("saved_searches").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
  ]);
  const defaults: NotificationPreferences = { user_id: user.id, email_enabled: true, immediate_strong: true, daily_digest: true, deadline_reminders: true, deadline_offsets: [7, 3, 1], timezone: "America/Sao_Paulo", digest_hour: 8 };
  return <main id="conteudo" className="shell pb-20 pt-8"><header className="mb-7 flex items-end justify-between gap-4 border-b border-[var(--ink)] pb-6"><div><p className="eyebrow text-[var(--green)]">Radar pessoal</p><h1 className="mt-2 text-4xl font-bold tracking-[-.06em] sm:text-5xl">Caixa de entrada</h1><p className="mt-3 text-[var(--ink-soft)]">Novidades reais, mudanças importantes e prazos em um só lugar.</p></div><BellRing className="hidden text-[var(--green)] sm:block" size={42} strokeWidth={1.5} /></header><InboxWorkspace initialEvents={(events.data || []) as NotificationEvent[]} initialPreferences={(preferences.data || defaults) as NotificationPreferences} initialSearches={(searches.data || []) as SavedSearch[]} /></main>;
}
