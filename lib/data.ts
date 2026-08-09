import { getOptionalUser } from "./auth";
import { demoJobs } from "./mock-data";
import { emptyAreaPreferences, isVisibleForPreferences, preferencesFromProfile } from "./job-preferences";
import { getSupabaseAdmin, hasDatabaseConfig } from "./supabase";
import type { DashboardData, Job, JobFilters, UserProfile } from "./types";

function applyFilters(jobs: Job[], filters: JobFilters) {
  const query = filters.query?.trim().toLocaleLowerCase("pt-BR");
  return jobs.filter((job) => {
    const haystack = `${job.title} ${job.company} ${job.description}`.toLocaleLowerCase("pt-BR");
    return (!query || haystack.includes(query)) && (!filters.source || job.source === filters.source)
      && (!filters.mode || job.work_mode === filters.mode)
      && (!filters.minScore || job.score >= filters.minScore);
  });
}

function rankJobs(jobs: Job[]) {
  const tier = (job: Job) => job.display_tier === "strong" ? 2 : job.display_tier === "watchlist" ? 1 : 0;
  return [...jobs].sort((left, right) => tier(right) - tier(left)
    || (right.profile_score || 0) - (left.profile_score || 0)
    || (right.quality_score || 0) - (left.quality_score || 0)
    || right.score - left.score
    || Date.parse(right.discovered_at) - Date.parse(left.discovered_at)
    || left.id.localeCompare(right.id));
}

function saoPauloDateKey(value: string | Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const part = (type: "year" | "month" | "day") => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function summarize(jobs: Job[], allRadar: Job[], filters: JobFilters, isDemo: boolean, personal: { saved: number | null; active: number | null; jobIds: string[] }) : DashboardData {
  const today = saoPauloDateKey(new Date());
  const pageSize = Math.min(50, Math.max(1, filters.pageSize || 20));
  const pageCount = Math.max(1, Math.ceil(jobs.length / pageSize));
  const page = Math.min(pageCount, Math.max(1, filters.page || 1));
  const offset = (page - 1) * pageSize;
  const sourceCounts = new Map<string, number>();
  jobs.forEach((job) => sourceCounts.set(job.source, (sourceCounts.get(job.source) ?? 0) + 1));
  return {
    jobs: jobs.slice(offset, offset + pageSize),
    total: jobs.length,
    isDemo,
    page,
    pageSize,
    pageCount,
    savedJobIds: personal.jobIds,
    authenticated: personal.saved !== null,
    tierCounts: {
      radar: allRadar.length,
      strong: allRadar.filter((job) => job.display_tier === "strong").length,
      watchlist: allRadar.filter((job) => job.display_tier === "watchlist").length,
    },
    sources: [...sourceCounts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    metrics: {
      newToday: allRadar.filter((job) => saoPauloDateKey(job.discovered_at) === today).length,
      highMatch: allRadar.filter((job) => job.score >= 80).length,
      saved: personal.saved,
      active: personal.active,
    },
  };
}

function hydrate(rows: unknown[], matchScores = new Map<string, number>()): Job[] {
  return (rows as Array<Job & { job_sources?: Array<{ count: number }> }>).map(({ job_sources, ...job }) => ({
    ...job,
    source_count: job_sources?.[0]?.count || 1,
    profile_score: matchScores.get(job.id) ?? null,
  }));
}

async function userContext() {
  const user = await getOptionalUser();
  if (!user || !hasDatabaseConfig()) return { user: null, profile: null, matches: new Map<string, number>(), saved: null, active: null, jobIds: [] as string[], declinedJobIds: [] as string[] };
  const db = getSupabaseAdmin();
  const [profileResult, applications, decisions] = await Promise.all([
    db.from("user_profiles").select("id,excluded_area_categories,excluded_area_terms").eq("user_id", user.id).maybeSingle(),
    db.from("tracked_applications").select("job_id,status,application_state").eq("user_id", user.id).neq("status", "archived").is("deleted_at", null),
    db.from("user_job_decisions").select("job_id").eq("user_id", user.id).eq("decision", "declined"),
  ]);
  const matches = new Map<string, number>();
  if (profileResult.data?.id) {
    const matchResult = await db.from("job_profile_matches").select("job_id,final_score").eq("profile_id", profileResult.data.id);
    (matchResult.data || []).forEach((match) => matches.set(match.job_id, match.final_score));
  }
  const rows = applications.data || [];
  return {
    user,
    profile: profileResult.data as Partial<UserProfile> | null,
    matches,
    saved: rows.length,
    active: rows.filter((application) => application.application_state === "applied").length,
    jobIds: rows.map((application) => application.job_id).filter((id): id is string => Boolean(id)),
    declinedJobIds: (decisions.data || []).map((decision) => decision.job_id),
  };
}

async function radarRows() {
  const db = getSupabaseAdmin();
  let result = await db.from("jobs").select("*,job_sources(count)")
    .in("display_tier", ["strong", "watchlist"]).eq("is_active", true).is("duplicate_of", null).limit(5000);
  if (result.error && /display_tier|target_fit|location_fit/i.test(result.error.message)) {
    result = await db.from("jobs").select("*,job_sources(count)")
      .in("verification_level", ["confirmed", "probable"]).in("area_fit", ["tech", "general"])
      .eq("is_active", true).is("duplicate_of", null).limit(5000);
  }
  if (result.error) throw new Error(`Falha ao carregar vagas: ${result.error.message}`);
  return result.data || [];
}

export async function getDashboardData(filters: JobFilters = {}): Promise<DashboardData> {
  if (!hasDatabaseConfig()) {
    const selected = filters.tier === "strong" ? demoJobs.filter((job) => job.display_tier !== "watchlist") : demoJobs;
    return summarize(applyFilters(selected, filters), demoJobs, filters, true, { saved: null, active: null, jobIds: [] });
  }
  const [context, rows] = await Promise.all([userContext(), radarRows()]);
  const preferences = context.profile ? preferencesFromProfile(context.profile) : emptyAreaPreferences;
  const declined = new Set(context.declinedJobIds);
  const radar = rankJobs(hydrate(rows, context.matches).map((job) => ({ ...job, display_tier: job.display_tier || "strong" })).filter((job) => isVisibleForPreferences(job, preferences) && !declined.has(job.id)));
  const selected = filters.tier === "strong" ? radar.filter((job) => job.display_tier === "strong") : radar;
  return summarize(applyFilters(selected, filters), radar, filters, false, context);
}

export async function getAllJobs(tier: "radar" | "strong" = "radar"): Promise<Job[]> {
  if (!hasDatabaseConfig()) return demoJobs;
  const [context, rows] = await Promise.all([userContext(), radarRows()]);
  const preferences = context.profile ? preferencesFromProfile(context.profile) : emptyAreaPreferences;
  const declined = new Set(context.declinedJobIds);
  const radar = rankJobs(hydrate(rows, context.matches).map((job) => ({ ...job, display_tier: job.display_tier || "strong" })).filter((job) => isVisibleForPreferences(job, preferences) && !declined.has(job.id)));
  return tier === "strong" ? radar.filter((job) => job.display_tier === "strong") : radar;
}
