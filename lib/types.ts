export type WorkMode = "remote" | "hybrid" | "onsite" | "unknown";
export type JobStatus = "new" | "saved" | "applied" | "dismissed";
export type DisplayTier = "strong" | "watchlist" | "hidden";
export type EvidenceFit = "confirmed" | "probable" | "unknown" | "incompatible";
export type ApplicationStatus = "saved" | "active" | "offer" | "rejected" | "withdrawn" | "archived";
export type ApplicationState = "not_applied" | "applied" | "rejected" | "accepted";
export type StageState = "pending" | "current" | "completed" | "skipped";

export interface Job {
  id: string;
  title: string;
  company: string;
  description: string;
  location: string;
  work_mode: WorkMode;
  source: string;
  source_url: string;
  published_at: string | null;
  discovered_at: string;
  score: number;
  score_reasons: string[];
  status: JobStatus;
  match_area: boolean;
  area_fit?: "tech" | "general" | "non_tech" | "ambiguous";
  area_reasons?: string[];
  primary_area?: string;
  area_tags?: string[];
  dedup_group_key?: string | null;
  dedup_confidence?: number;
  dedup_reasons?: string[];
  source_count?: number;
  profile_score?: number | null;
  display_tier?: DisplayTier;
  target_fit?: EvidenceFit;
  location_fit?: EvidenceFit;
  display_reasons?: string[];
  classification_version?: string;
  match_location: boolean;
  match_start: boolean;
  candidate_kind?: "job" | "lead" | "noise";
  quality_score?: number;
  validation_status?: "accepted" | "review" | "rejected";
  validation_reasons?: string[];
  is_active?: boolean;
  canonical_key?: string | null;
  identity_key?: string | null;
  last_checked_at?: string | null;
  duplicate_of?: string | null;
  verification_level?: "confirmed" | "probable" | "review" | "rejected";
  ai_status?: "pending" | "completed" | "failed" | "skipped";
  official_url?: string | null;
  application_url?: string | null;
  application_deadline?: string | null;
  created_at?: string;
}

export interface UserProfile {
  id?: string;
  name: string;
  goals: string;
  resume_text: string;
  skills: string[];
  desired_roles: string[];
  preferred_locations: string[];
  preferred_work_modes: WorkMode[];
  target_start: string;
  dealbreakers: string;
  ai_enabled: boolean;
  excluded_area_categories: string[];
  excluded_area_terms: string[];
}

export interface ApplicationStage {
  id: string;
  application_id: string;
  name: string;
  position: number;
  state: StageState;
  scheduled_at: string | null;
  completed_at: string | null;
  notes: string;
  milestone: "none" | "application_submitted";
  created_at: string;
  updated_at: string;
}

export interface TrackedApplication {
  id: string;
  user_id: string;
  job_id: string | null;
  title: string;
  company: string;
  source_url: string;
  location: string;
  work_mode: WorkMode;
  description: string;
  application_deadline: string | null;
  notes: string;
  priority: number;
  status: ApplicationStatus;
  application_state: ApplicationState;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  application_stages?: ApplicationStage[];
}

export type ScrapeRunStatus = "queued" | "running" | "succeeded" | "failed";

export interface ScrapeRun {
  id: string;
  requested_by: string;
  status: ScrapeRunStatus;
  requested_at: string;
  started_at: string | null;
  finished_at: string | null;
  exit_code: number | null;
  summary: string;
  error_message: string | null;
}

export interface ProfileMatch {
  job_id: string;
  rules_score: number;
  ai_score: number | null;
  final_score: number;
  summary: string;
  strengths: string[];
  gaps: string[];
  concerns: string[];
  model: string | null;
  analyzed_at: string;
  jobs: (Pick<Job, "id" | "title" | "company" | "source_url" | "location" | "work_mode" | "score"> & Partial<Job>) | null;
}

export interface JobFilters {
  query?: string;
  source?: string;
  mode?: string;
  status?: string;
  minScore?: number;
  tier?: "radar" | "strong";
  page?: number;
  pageSize?: number;
}

export interface DashboardData {
  jobs: Job[];
  total: number;
  isDemo: boolean;
  sources: Array<{ name: string; count: number }>;
  tierCounts: { radar: number; strong: number; watchlist: number };
  page: number;
  pageSize: number;
  pageCount: number;
  savedJobIds: string[];
  authenticated: boolean;
  metrics: {
    newToday: number;
    highMatch: number;
    saved: number | null;
    active: number | null;
  };
}
