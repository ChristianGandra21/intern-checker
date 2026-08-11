import { isScrapingAdmin } from "./admin";
import { getOptionalUser } from "./auth";
import { getSupabaseAdmin, hasDatabaseConfig } from "./supabase";
import type { Job, ProfileMatch } from "./types";

export interface JobSourceDetail {
  id: string;
  source: string;
  source_url: string;
  first_seen_at: string;
  last_seen_at: string;
  raw_candidates?: { title: string; snippet: string; raw_payload: Record<string, unknown>; official_url: string | null; application_url: string | null; discovered_at: string } | null;
}

export async function getJobDetail(id: string) {
  if (!hasDatabaseConfig()) return null;
  const user = await getOptionalUser();
  const db = getSupabaseAdmin();
  const result = await db.from("jobs").select("*,job_sources(*,raw_candidates(title,snippet,raw_payload,official_url,application_url,discovered_at))").eq("id", id).maybeSingle();
  if (result.error || !result.data) return null;
  const job = result.data as Job & { job_sources: JobSourceDetail[] };
  if ((job.display_tier === "hidden" || !job.is_active) && !isScrapingAdmin(user)) return null;
  let match: ProfileMatch | null = null;
  let saved = false;
  if (user) {
    const profile = await db.from("user_profiles").select("id").eq("user_id", user.id).maybeSingle();
    if (profile.data?.id) {
      const matchResult = await db.from("job_profile_matches").select("*").eq("profile_id", profile.data.id).eq("job_id", id).maybeSingle();
      match = matchResult.data as ProfileMatch | null;
    }
    const application = await db.from("tracked_applications").select("id").eq("user_id", user.id).eq("job_id", id).is("deleted_at", null).maybeSingle();
    saved = Boolean(application.data);
  }
  return { job, match, saved, authenticated: Boolean(user), admin: isScrapingAdmin(user) };
}
