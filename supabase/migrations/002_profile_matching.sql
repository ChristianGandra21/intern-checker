create table public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  name text not null default '',
  goals text not null default '',
  resume_text text not null default '',
  skills text[] not null default '{}',
  desired_roles text[] not null default '{}',
  preferred_locations text[] not null default '{}',
  preferred_work_modes public.work_mode[] not null default '{}',
  target_start text not null default '2027.1',
  dealbreakers text not null default '',
  ai_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.job_profile_matches (
  job_id uuid not null references public.jobs(id) on delete cascade,
  profile_id uuid not null references public.user_profiles(id) on delete cascade,
  rules_score smallint not null check (rules_score between 0 and 100),
  ai_score smallint check (ai_score between 0 and 100),
  final_score smallint not null check (final_score between 0 and 100),
  summary text not null default '',
  strengths text[] not null default '{}',
  gaps text[] not null default '{}',
  concerns text[] not null default '{}',
  model text,
  analyzed_at timestamptz not null default now(),
  primary key (job_id, profile_id)
);

create index job_profile_matches_profile_score_idx
  on public.job_profile_matches (profile_id, final_score desc, analyzed_at desc);

create trigger user_profiles_set_updated_at before update on public.user_profiles
for each row execute function public.set_updated_at();

alter table public.user_profiles enable row level security;
alter table public.job_profile_matches enable row level security;

-- Perfil e currículo são acessados somente pelo servidor com a service role.
