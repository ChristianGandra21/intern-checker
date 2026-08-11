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
  first_seen_at?: string;
  last_seen_at?: string;
  content_changed_at?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_period?: "hour" | "month" | "year" | null;
  workload_hours_week?: number | null;
  benefits?: string[];
  requirements?: string[];
  responsibilities?: string[];
  education_requirements?: string[];
  extracted_skills?: string[];
  details_confidence?: Record<string, number>;
  details_extracted_at?: string | null;
  manual_display_tier?: DisplayTier | null;
  manual_candidate_kind?: "job" | "lead" | "noise" | null;
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
  rejection_reason: string;
  priority: number;
  decision_priority_enabled?: boolean;
  decision_priority_score?: number | null;
  decision_priority_criteria?: DecisionPriorityCriteria;
  company_context?: string;
  company_culture?: string;
  company_reviews?: string;
  application_resume_text?: string;
  candidate_pitch?: string;
  status: ApplicationStatus;
  application_state: ApplicationState;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  application_stages?: ApplicationStage[];
  application_recommendations?: ApplicationRecommendation[];
  jobs?: { source: string } | null;
}

export type DecisionPriorityCriterionKey = "career_alignment" | "learning_growth" | "work_interest" | "compensation_benefits" | "location_flexibility" | "company_culture";
export type DecisionPriorityCriteria = Partial<Record<DecisionPriorityCriterionKey, number>>;

export type ScrapeRunStatus = "queued" | "running" | "succeeded" | "failed";
export type ScrapeRunRunner = "local" | "github";

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
  runner: ScrapeRunRunner;
  external_run_id: string | null;
  external_url: string | null;
  ingestion_run_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface IngestionRun {
  id: string;
  status: "running" | "success" | "failed";
  started_at: string;
  finished_at: string | null;
  found_count: number;
  persisted_count: number;
  created_count: number;
  updated_count: number;
  duplicate_count: number;
  strong_count: number;
  watchlist_count: number;
  hidden_count: number;
  rejected_count: number;
  resolved_count: number;
  failure_count: number;
  new_radar_count: number;
  duration_ms: number | null;
  source_summary: Record<string, number>;
  error_message: string | null;
}

export interface JobModeration {
  job_id: string;
  identity_key: string | null;
  override_display_tier: DisplayTier | null;
  override_candidate_kind: "job" | "lead" | "noise" | null;
  corrected_fields: Record<string, unknown>;
  reason: string;
  fixture_status: "pending" | "exported" | "ignored";
  created_at: string;
  updated_at: string;
}

export interface NotificationPreferences {
  user_id: string;
  email_enabled: boolean;
  immediate_strong: boolean;
  daily_digest: boolean;
  deadline_reminders: boolean;
  deadline_offsets: number[];
  timezone: string;
  digest_hour: number;
}

export interface NotificationEvent {
  id: string;
  event_type: "new_strong" | "job_updated" | "daily_digest" | "deadline";
  job_id: string | null;
  application_id: string | null;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  status: "pending" | "preview" | "sent" | "failed" | "dismissed";
  read_at: string | null;
  emailed_at: string | null;
  created_at: string;
}

export interface SavedSearch {
  id: string;
  name: string;
  filters: Record<string, string | number | boolean>;
  notify: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApplicationRecommendation {
  id: string;
  application_id: string;
  strengths: string[];
  gaps: string[];
  keywords: string[];
  resume_suggestions: string[];
  study_topics: string[];
  interview_questions: string[];
  next_steps: string[];
  overall_assessment: string;
  company_culture_assessment: string[];
  pitch_strengths: string[];
  pitch_improvements: string[];
  analyzed_resume: boolean;
  analyzed_pitch: boolean;
  model: string | null;
  created_at: string;
  updated_at: string;
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
  discoveredFrom?: string;
  discoveredTo?: string;
  deadline?: "open" | "7d" | "30d";
  salary?: "informed";
  skill?: string;
  company?: string;
  novelty?: "new" | "updated";
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
  latestIngestionRun: IngestionRun | null;
  canReviewIngestion: boolean;
  metrics: {
    newToday: number;
    highMatch: number;
    saved: number | null;
    active: number | null;
  };
}
