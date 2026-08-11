alter table public.jobs
  add column if not exists content_changed_at timestamptz,
  add column if not exists salary_min numeric(12,2),
  add column if not exists salary_max numeric(12,2),
  add column if not exists salary_period text
    check (salary_period is null or salary_period in ('hour', 'month', 'year')),
  add column if not exists workload_hours_week numeric(5,2),
  add column if not exists benefits text[] not null default '{}',
  add column if not exists requirements text[] not null default '{}',
  add column if not exists responsibilities text[] not null default '{}',
  add column if not exists education_requirements text[] not null default '{}',
  add column if not exists extracted_skills text[] not null default '{}',
  add column if not exists details_confidence jsonb not null default '{}',
  add column if not exists details_extracted_at timestamptz,
  add column if not exists manual_display_tier text
    check (manual_display_tier is null or manual_display_tier in ('strong', 'watchlist', 'hidden')),
  add column if not exists manual_candidate_kind text
    check (manual_candidate_kind is null or manual_candidate_kind in ('job', 'lead', 'noise')),
  add column if not exists manual_fields jsonb not null default '{}',
  add column if not exists moderated_at timestamptz;

update public.jobs
set first_seen_at = coalesce(first_seen_at, created_at, discovered_at),
    last_seen_at = coalesce(last_seen_at, updated_at, discovered_at),
    content_changed_at = coalesce(content_changed_at, first_seen_at, created_at, discovered_at)
where content_changed_at is null;

create index if not exists jobs_first_seen_visible_idx
  on public.jobs (first_seen_at desc)
  where is_active = true and duplicate_of is null;
create index if not exists jobs_last_seen_idx on public.jobs (last_seen_at desc);
create index if not exists jobs_deadline_visible_idx
  on public.jobs (application_deadline)
  where is_active = true and duplicate_of is null and application_deadline is not null;
create index if not exists jobs_extracted_skills_idx on public.jobs using gin (extracted_skills);

alter table public.ingestion_runs
  add column if not exists created_count integer not null default 0,
  add column if not exists updated_count integer not null default 0,
  add column if not exists duplicate_count integer not null default 0,
  add column if not exists strong_count integer not null default 0,
  add column if not exists watchlist_count integer not null default 0,
  add column if not exists scrape_run_id uuid references public.scrape_runs(id) on delete set null;

alter table public.source_runs
  add column if not exists created_count integer not null default 0,
  add column if not exists updated_count integer not null default 0,
  add column if not exists duplicate_count integer not null default 0,
  add column if not exists strong_count integer not null default 0,
  add column if not exists watchlist_count integer not null default 0;

alter table public.scrape_runs
  add column if not exists ingestion_run_id uuid references public.ingestion_runs(id) on delete set null;

create table if not exists public.job_moderations (
  job_id uuid primary key references public.jobs(id) on delete cascade,
  identity_key text,
  override_display_tier text
    check (override_display_tier is null or override_display_tier in ('strong', 'watchlist', 'hidden')),
  override_candidate_kind text
    check (override_candidate_kind is null or override_candidate_kind in ('job', 'lead', 'noise')),
  corrected_fields jsonb not null default '{}',
  reason text not null default '',
  fixture_status text not null default 'pending'
    check (fixture_status in ('pending', 'exported', 'ignored')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_review_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  ingestion_run_id uuid references public.ingestion_runs(id) on delete set null,
  reviewed_by uuid not null references auth.users(id) on delete cascade,
  previous_values jsonb not null default '{}',
  next_values jsonb not null default '{}',
  reason text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists job_moderations_identity_idx
  on public.job_moderations (identity_key) where identity_key is not null;
create index if not exists job_review_events_job_created_idx
  on public.job_review_events (job_id, created_at desc);
create trigger job_moderations_set_updated_at before update on public.job_moderations
for each row execute function public.set_updated_at();

create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  filters jsonb not null default '{}',
  notify boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_enabled boolean not null default true,
  immediate_strong boolean not null default true,
  daily_digest boolean not null default true,
  deadline_reminders boolean not null default true,
  deadline_offsets integer[] not null default '{7,3,1}',
  timezone text not null default 'America/Sao_Paulo',
  digest_hour smallint not null default 8 check (digest_hour between 0 and 23),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null
    check (event_type in ('new_strong', 'job_updated', 'daily_digest', 'deadline')),
  job_id uuid references public.jobs(id) on delete cascade,
  application_id uuid references public.tracked_applications(id) on delete cascade,
  dedup_key text not null,
  title text not null,
  body text not null default '',
  payload jsonb not null default '{}',
  status text not null default 'pending'
    check (status in ('pending', 'preview', 'sent', 'failed', 'dismissed')),
  read_at timestamptz,
  emailed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  unique (user_id, dedup_key)
);

create index if not exists notification_events_user_created_idx
  on public.notification_events (user_id, created_at desc);
create index if not exists notification_events_pending_idx
  on public.notification_events (status, created_at) where status in ('pending', 'preview');
create trigger saved_searches_set_updated_at before update on public.saved_searches
for each row execute function public.set_updated_at();
create trigger notification_preferences_set_updated_at before update on public.notification_preferences
for each row execute function public.set_updated_at();

create table if not exists public.application_recommendations (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.tracked_applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content_hash text not null,
  profile_hash text not null,
  strengths text[] not null default '{}',
  gaps text[] not null default '{}',
  keywords text[] not null default '{}',
  resume_suggestions text[] not null default '{}',
  study_topics text[] not null default '{}',
  interview_questions text[] not null default '{}',
  next_steps text[] not null default '{}',
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, content_hash, profile_hash)
);

alter table public.tracked_applications
  add column if not exists rejection_reason text not null default '';

create index if not exists application_recommendations_application_idx
  on public.application_recommendations (application_id, created_at desc);
create trigger application_recommendations_set_updated_at before update on public.application_recommendations
for each row execute function public.set_updated_at();

alter table public.job_moderations enable row level security;
alter table public.job_review_events enable row level security;
alter table public.saved_searches enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_events enable row level security;
alter table public.application_recommendations enable row level security;

create policy saved_searches_own_all on public.saved_searches for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notification_preferences_own_all on public.notification_preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notification_events_own_select on public.notification_events for select to authenticated
  using (user_id = auth.uid());
create policy notification_events_own_update on public.notification_events for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy application_recommendations_own_select on public.application_recommendations for select to authenticated
  using (user_id = auth.uid());

comment on column public.jobs.first_seen_at is 'Primeira vez em que a oportunidade canônica foi observada; nunca é sobrescrita pela ingestão.';
comment on column public.jobs.last_seen_at is 'Última execução em que alguma fonte observou a oportunidade.';
comment on column public.jobs.content_changed_at is 'Última vez em que o conteúdo canônico mudou.';
comment on table public.job_moderations is 'Override administrativo persistente, limitado à identidade da oportunidade.';
comment on table public.notification_events is 'Caixa de entrada idempotente e fila de pré-visualização/envio de alertas.';
