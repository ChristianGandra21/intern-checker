alter table public.jobs
  add column verification_level text not null default 'review'
    check (verification_level in ('confirmed', 'probable', 'review', 'rejected')),
  add column official_url text,
  add column application_url text,
  add column external_id text,
  add column content_hash text,
  add column ai_status text not null default 'pending'
    check (ai_status in ('pending', 'completed', 'failed', 'skipped')),
  add column ai_result jsonb not null default '{}',
  add column application_deadline timestamptz,
  add column first_seen_at timestamptz not null default now(),
  add column last_seen_at timestamptz not null default now(),
  add column missing_runs integer not null default 0;

update public.jobs
set verification_level = case
  when validation_status = 'accepted' then 'probable'
  when validation_status = 'rejected' then 'rejected'
  else 'review'
end;

create index jobs_verification_visible_idx
  on public.jobs (verification_level, is_active, score desc, discovered_at desc)
  where duplicate_of is null;
create index jobs_external_id_idx on public.jobs (external_id) where external_id is not null;
create index jobs_content_hash_idx on public.jobs (content_hash) where content_hash is not null;

create table public.raw_candidates (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.ingestion_runs(id) on delete set null,
  source text not null,
  source_type text not null default 'discovery',
  external_id text,
  source_url text not null,
  title text not null,
  snippet text not null default '',
  raw_payload jsonb not null default '{}',
  content_hash text not null,
  dedup_key text not null unique,
  state text not null default 'discovered'
    check (state in ('discovered', 'resolved', 'extracted', 'persisted', 'failed')),
  official_url text,
  application_url text,
  discovered_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.job_sources (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  raw_candidate_id uuid references public.raw_candidates(id) on delete set null,
  source text not null,
  source_url text not null,
  external_id text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (job_id, source_url)
);

create table public.source_registry (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  adapter text not null,
  identifier text not null,
  base_url text not null,
  origin text not null default 'discovered' check (origin in ('curated', 'discovered')),
  enabled boolean not null default false,
  successful_probes integer not null default 0,
  consecutive_failures integer not null default 0,
  cursor jsonb not null default '{}',
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (adapter, identifier)
);

create table public.source_runs (
  id uuid primary key default gen_random_uuid(),
  ingestion_run_id uuid references public.ingestion_runs(id) on delete cascade,
  source text not null,
  adapter text not null,
  mode text not null default 'public',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  discovered_count integer not null default 0,
  resolved_count integer not null default 0,
  accepted_count integer not null default 0,
  error_message text
);

create table public.ai_analysis_cache (
  content_hash text not null,
  prompt_version text not null,
  model text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (content_hash, prompt_version, model)
);

create trigger raw_candidates_set_updated_at before update on public.raw_candidates
for each row execute function public.set_updated_at();
create trigger source_registry_set_updated_at before update on public.source_registry
for each row execute function public.set_updated_at();

alter table public.raw_candidates enable row level security;
alter table public.job_sources enable row level security;
alter table public.source_registry enable row level security;
alter table public.source_runs enable row level security;
alter table public.ai_analysis_cache enable row level security;

-- Todas as tabelas da pipeline são acessadas apenas pela service role do backend.
