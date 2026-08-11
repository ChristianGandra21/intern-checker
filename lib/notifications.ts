import type { SupabaseClient } from "@supabase/supabase-js";
import { isVisibleForPreferences, preferencesFromProfile } from "./job-preferences";
import type { Job, UserProfile } from "./types";

export const notificationPreviewMode = () => process.env.NOTIFICATION_EMAIL_SEND_ENABLED !== "true";

function matchesSavedSearch(job: Job, searches: Array<{ filters: Record<string, unknown>; notify: boolean }>) {
  const enabled = searches.filter((search) => search.notify);
  if (!enabled.length) return true;
  return enabled.some(({ filters }) => {
    const query = String(filters.q || "").trim().toLocaleLowerCase("pt-BR");
    const haystack = `${job.title} ${job.company} ${job.description}`.toLocaleLowerCase("pt-BR");
    return (!query || haystack.includes(query))
      && (!filters.mode || job.work_mode === filters.mode)
      && (!filters.score || job.score >= Number(filters.score));
  });
}

export async function queueIngestionNotifications(db: SupabaseClient, startedAt: string) {
  const [profilesResult, newJobsResult, updatedJobsResult] = await Promise.all([
    db.from("user_profiles").select("user_id,excluded_area_categories,excluded_area_terms").not("user_id", "is", null),
    db.from("jobs").select("*").eq("display_tier", "strong").eq("is_active", true).is("duplicate_of", null).gte("first_seen_at", startedAt),
    db.from("jobs").select("*").in("display_tier", ["strong", "watchlist"]).eq("is_active", true).is("duplicate_of", null)
      .lt("first_seen_at", startedAt).gte("content_changed_at", startedAt),
  ]);
  if (profilesResult.error || newJobsResult.error || updatedJobsResult.error) return;
  const status = notificationPreviewMode() ? "preview" : "pending";
  for (const profile of profilesResult.data ?? []) {
    if (!profile.user_id) continue;
    const [preferencesResult, decisionsResult, applicationsResult, searchesResult] = await Promise.all([
      db.from("notification_preferences").select("*").eq("user_id", profile.user_id).maybeSingle(),
      db.from("user_job_decisions").select("job_id").eq("user_id", profile.user_id).eq("decision", "declined"),
      db.from("tracked_applications").select("job_id").eq("user_id", profile.user_id).is("deleted_at", null),
      db.from("saved_searches").select("filters,notify").eq("user_id", profile.user_id),
    ]);
    const preferences = preferencesResult.data ?? { immediate_strong: true, daily_digest: true };
    const excluded = new Set([...(decisionsResult.data ?? []), ...(applicationsResult.data ?? [])].map((row) => row.job_id).filter(Boolean));
    const areaPreferences = preferencesFromProfile(profile as Partial<UserProfile>);
    const rows: Array<Record<string, unknown>> = [];
    if (preferences.immediate_strong) {
      for (const job of (newJobsResult.data ?? []) as Job[]) {
        if (excluded.has(job.id) || !isVisibleForPreferences(job, areaPreferences) || !matchesSavedSearch(job, searchesResult.data || [])) continue;
        rows.push({
          user_id: profile.user_id, event_type: "new_strong", job_id: job.id,
          dedup_key: `new-strong:${job.id}:${job.first_seen_at}`,
          title: `Nova vaga forte · ${job.company}`, body: job.title,
          payload: { href: `/jobs/${job.id}`, source_url: job.application_url || job.official_url || job.source_url }, status,
        });
      }
    }
    if (preferences.daily_digest) {
      for (const job of (updatedJobsResult.data ?? []) as Job[]) {
        if (excluded.has(job.id) || !isVisibleForPreferences(job, areaPreferences) || !matchesSavedSearch(job, searchesResult.data || [])) continue;
        rows.push({
          user_id: profile.user_id, event_type: "job_updated", job_id: job.id,
          dedup_key: `job-updated:${job.id}:${job.content_changed_at}`,
          title: `Vaga atualizada · ${job.company}`, body: job.title,
          payload: { href: `/jobs/${job.id}` }, status,
        });
      }
    }
    if (rows.length) await db.from("notification_events").upsert(rows, { onConflict: "user_id,dedup_key", ignoreDuplicates: true });
  }
}

export async function queueDeadlineReminders(db: SupabaseClient, userId: string) {
  const preferences = await db.from("notification_preferences").select("*").eq("user_id", userId).maybeSingle();
  if (preferences.data && !preferences.data.deadline_reminders) return;
  const offsets = (preferences.data?.deadline_offsets as number[] | undefined) ?? [7, 3, 1];
  const applications = await db.from("tracked_applications").select("id,job_id,title,company,application_deadline")
    .eq("user_id", userId).is("deleted_at", null).in("application_state", ["not_applied", "applied"]).not("application_deadline", "is", null);
  if (applications.error) return;
  const today = new Date();
  const rows: Array<Record<string, unknown>> = [];
  for (const application of applications.data ?? []) {
    const deadline = Date.parse(application.application_deadline);
    const days = Math.ceil((deadline - today.getTime()) / 86_400_000);
    if (!offsets.includes(days)) continue;
    rows.push({
      user_id: userId, event_type: "deadline", job_id: application.job_id, application_id: application.id,
      dedup_key: `deadline:${application.id}:${days}`,
      title: `Prazo em ${days} dia${days === 1 ? "" : "s"} · ${application.company}`,
      body: application.title, payload: { href: `/applications/${application.id}`, days },
      status: notificationPreviewMode() ? "preview" : "pending",
    });
  }
  if (rows.length) await db.from("notification_events").upsert(rows, { onConflict: "user_id,dedup_key", ignoreDuplicates: true });
}
