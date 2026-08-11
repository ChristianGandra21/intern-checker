import { getOptionalUser } from "./auth";
import { isScrapingAdmin } from "./admin";
import { demoJobs } from "./mock-data";
import { emptyAreaPreferences, isVisibleForPreferences, preferencesFromProfile } from "./job-preferences";
import { getSupabaseAdmin, hasDatabaseConfig } from "./supabase";
import type { DashboardData, IngestionRun, Job, JobFilters, UserProfile } from "./types";

let lastSuccessfulRadarRows: unknown[] = [];

const transientDatabaseError = (message: string) => /fetch failed|network|econn|etimeout|timed out|socket/i.test(message);
const retryDelay = (attempt: number) => new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));

function applyFilters(jobs: Job[], filters: JobFilters) {
  const query = filters.query?.trim().toLocaleLowerCase("pt-BR");
  return jobs.filter((job) => {
    const haystack = `${job.title} ${job.company} ${job.description}`.toLocaleLowerCase("pt-BR");
    const includedDate = saoPauloDateKey(job.first_seen_at || job.discovered_at);
    const changedDate = job.content_changed_at ? saoPauloDateKey(job.content_changed_at) : "";
    const deadline = job.application_deadline ? Date.parse(job.application_deadline) : 0;
    const deadlineDays = deadline ? Math.ceil((deadline - Date.now()) / 86_400_000) : null;
    return (!query || haystack.includes(query)) && (!filters.source || job.source === filters.source)
      && (!filters.mode || job.work_mode === filters.mode)
      && (!filters.minScore || job.score >= filters.minScore)
      && (!filters.discoveredFrom || includedDate >= filters.discoveredFrom)
      && (!filters.discoveredTo || includedDate <= filters.discoveredTo)
      && (!filters.company || job.company.toLocaleLowerCase("pt-BR").includes(filters.company.toLocaleLowerCase("pt-BR")))
      && (!filters.skill || (job.extracted_skills || []).some((skill) => skill.toLocaleLowerCase("pt-BR").includes(filters.skill!.toLocaleLowerCase("pt-BR"))))
      && (!filters.salary || Boolean(job.salary_min || job.salary_max))
      && (!filters.deadline || (deadlineDays !== null && deadlineDays >= 0 && (filters.deadline === "open" || deadlineDays <= Number(filters.deadline.slice(0, -1)))))
      && (!filters.novelty || (filters.novelty === "new" ? includedDate === saoPauloDateKey(new Date()) : changedDate === saoPauloDateKey(new Date()) && changedDate !== includedDate));
  });
}

function rankJobs(jobs: Job[]) {
  const tier = (job: Job) => job.display_tier === "strong" ? 3
    : job.display_tier === "watchlist" && job.candidate_kind !== "lead" ? 2
      : job.display_tier === "watchlist" ? 1 : 0;
  return [...jobs].sort((left, right) => tier(right) - tier(left)
    || (right.profile_score || 0) - (left.profile_score || 0)
    || (right.quality_score || 0) - (left.quality_score || 0)
    || right.score - left.score
    || Date.parse(right.first_seen_at || right.discovered_at) - Date.parse(left.first_seen_at || left.discovered_at)
    || left.id.localeCompare(right.id));
}

function saoPauloDateKey(value: string | Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const part = (type: "year" | "month" | "day") => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function summarize(
  jobs: Job[],
  allRadar: Job[],
  filters: JobFilters,
  isDemo: boolean,
  personal: { saved: number | null; active: number | null; jobIds: string[] },
  ingestion: { latest: IngestionRun | null; canReview: boolean } = { latest: null, canReview: false },
) : DashboardData {
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
    latestIngestionRun: ingestion.latest,
    canReviewIngestion: ingestion.canReview,
    tierCounts: {
      radar: allRadar.length,
      strong: allRadar.filter((job) => job.display_tier === "strong").length,
      watchlist: allRadar.filter((job) => job.display_tier === "watchlist").length,
    },
    sources: [...sourceCounts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    metrics: {
      newToday: allRadar.filter((job) => saoPauloDateKey(job.first_seen_at || job.discovered_at) === today).length,
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
  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let result = await db.from("jobs").select("*,job_sources(count)")
      .in("display_tier", ["strong", "watchlist"]).eq("is_active", true).is("duplicate_of", null).limit(5000);
    if (result.error && /display_tier|target_fit|location_fit/i.test(result.error.message)) {
      result = await db.from("jobs").select("*,job_sources(count)")
        .in("verification_level", ["confirmed", "probable"]).in("area_fit", ["tech", "general"])
        .eq("is_active", true).is("duplicate_of", null).limit(5000);
    }
    if (!result.error) {
      lastSuccessfulRadarRows = result.data || [];
      return lastSuccessfulRadarRows;
    }
    lastError = result.error.message;
    if (!transientDatabaseError(lastError)) throw new Error(`Falha ao carregar vagas: ${lastError}`);
    if (attempt < 2) await retryDelay(attempt);
  }
  console.error(`Falha transitória ao carregar vagas após 3 tentativas: ${lastError}`);
  return lastSuccessfulRadarRows;
}

async function latestIngestionRun(): Promise<IngestionRun | null> {
  const db = getSupabaseAdmin();
  try {
    const result = await db.from("ingestion_runs").select("id,status,started_at,finished_at,found_count,persisted_count,created_count,updated_count,duplicate_count,strong_count,watchlist_count,hidden_count,rejected_count,resolved_count,failure_count,duration_ms")
      .order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (result.error || !result.data) return null;
    let visibleCreated = db.from("jobs").select("id", { count: "exact", head: true })
      .in("display_tier", ["strong", "watchlist"])
      .eq("is_active", true).is("duplicate_of", null)
      .gte("first_seen_at", result.data.started_at);
    if (result.data.finished_at) visibleCreated = visibleCreated.lte("first_seen_at", result.data.finished_at);
    const visibleResult = await visibleCreated;
    return {
      ...result.data,
      new_radar_count: visibleResult.error ? 0 : visibleResult.count || 0,
      source_summary: {},
      error_message: null,
    } as IngestionRun;
  } catch {
    return null;
  }
}

export async function getDashboardData(filters: JobFilters = {}): Promise<DashboardData> {
  if (!hasDatabaseConfig()) {
    const selected = filters.tier === "strong" ? demoJobs.filter((job) => job.display_tier !== "watchlist") : demoJobs;
    return summarize(applyFilters(selected, filters), demoJobs, filters, true, { saved: null, active: null, jobIds: [] });
  }
  const [context, rows, latest] = await Promise.all([userContext(), radarRows(), latestIngestionRun()]);
  const preferences = context.profile ? preferencesFromProfile(context.profile) : emptyAreaPreferences;
  const declined = new Set(context.declinedJobIds);
  const radar = rankJobs(hydrate(rows, context.matches).map((job) => ({ ...job, display_tier: job.display_tier || "strong" })).filter((job) => isVisibleForPreferences(job, preferences) && !declined.has(job.id)));
  const selected = filters.tier === "strong" ? radar.filter((job) => job.display_tier === "strong") : radar;
  return summarize(applyFilters(selected, filters), radar, filters, false, context, {
    latest,
    canReview: isScrapingAdmin(context.user),
  });
}

export async function getAllJobs(tier: "radar" | "strong" = "radar"): Promise<Job[]> {
  if (!hasDatabaseConfig()) return demoJobs;
  const [context, rows] = await Promise.all([userContext(), radarRows()]);
  const preferences = context.profile ? preferencesFromProfile(context.profile) : emptyAreaPreferences;
  const declined = new Set(context.declinedJobIds);
  const radar = rankJobs(hydrate(rows, context.matches).map((job) => ({ ...job, display_tier: job.display_tier || "strong" })).filter((job) => isVisibleForPreferences(job, preferences) && !declined.has(job.id)));
  return tier === "strong" ? radar.filter((job) => job.display_tier === "strong") : radar;
}
