create extension if not exists pgcrypto;

create type public.job_status as enum ('new', 'saved', 'applied', 'dismissed');
create type public.work_mode as enum ('remote', 'hybrid', 'onsite', 'unknown');

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  company text not null default 'Não informada',
  description text not null default '',
  location text not null default '',
  work_mode public.work_mode not null default 'unknown',
  source text not null,
  source_url text not null,
  published_at timestamptz,
  discovered_at timestamptz not null default now(),
  score smallint not null default 0 check (score between 0 and 100),
  score_reasons text[] not null default '{}',
  status public.job_status not null default 'new',
  match_area boolean not null default false,
  match_location boolean not null default false,
  match_start boolean not null default false,
  fingerprint text not null unique,
  raw_payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index jobs_score_discovered_idx on public.jobs (score desc, discovered_at desc);
create index jobs_status_idx on public.jobs (status);
create index jobs_source_idx on public.jobs (source);
create index jobs_source_url_idx on public.jobs (source_url);

create table public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  found_count integer not null default 0,
  accepted_count integer not null default 0,
  source_summary jsonb not null default '{}',
  error_message text
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger jobs_set_updated_at before update on public.jobs
for each row execute function public.set_updated_at();

alter table public.jobs enable row level security;
alter table public.ingestion_runs enable row level security;

-- O app usa apenas a service role no servidor. Nenhuma tabela é exposta ao navegador.
