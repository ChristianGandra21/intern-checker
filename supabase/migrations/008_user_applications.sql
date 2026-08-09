alter table public.user_profiles
  add column user_id uuid references auth.users(id) on delete cascade;

alter table public.user_profiles drop constraint if exists user_profiles_singleton_key;
alter table public.user_profiles drop constraint if exists user_profiles_singleton_check;
alter table public.user_profiles add constraint user_profiles_user_id_key unique (user_id);

create table public.tracked_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  title text not null,
  company text not null,
  source_url text not null,
  location text not null default '',
  work_mode public.work_mode not null default 'unknown',
  description text not null default '',
  application_deadline timestamptz,
  notes text not null default '',
  priority smallint not null default 1 check (priority between 0 and 3),
  status text not null default 'saved'
    check (status in ('saved', 'active', 'offer', 'rejected', 'withdrawn', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index tracked_applications_user_job_key
  on public.tracked_applications (user_id, job_id) where job_id is not null;
create index tracked_applications_user_status_idx
  on public.tracked_applications (user_id, status, updated_at desc);

create table public.application_stages (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.tracked_applications(id) on delete cascade,
  name text not null,
  position integer not null check (position >= 0),
  state text not null default 'pending'
    check (state in ('pending', 'current', 'completed', 'skipped')),
  scheduled_at timestamptz,
  completed_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, position)
);

create unique index application_stages_one_current_idx
  on public.application_stages (application_id) where state = 'current';
create index application_stages_schedule_idx
  on public.application_stages (application_id, scheduled_at) where scheduled_at is not null;

create trigger tracked_applications_set_updated_at before update on public.tracked_applications
for each row execute function public.set_updated_at();
create trigger application_stages_set_updated_at before update on public.application_stages
for each row execute function public.set_updated_at();

alter table public.tracked_applications enable row level security;
alter table public.application_stages enable row level security;

create policy user_profiles_own_select on public.user_profiles for select to authenticated
  using (user_id = auth.uid());
create policy user_profiles_own_insert on public.user_profiles for insert to authenticated
  with check (user_id = auth.uid());
create policy user_profiles_own_update on public.user_profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy job_profile_matches_own_select on public.job_profile_matches for select to authenticated
  using (exists (select 1 from public.user_profiles p where p.id = profile_id and p.user_id = auth.uid()));

create policy tracked_applications_own_all on public.tracked_applications for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy application_stages_own_all on public.application_stages for all to authenticated
  using (exists (
    select 1 from public.tracked_applications a
    where a.id = application_id and a.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.tracked_applications a
    where a.id = application_id and a.user_id = auth.uid()
  ));

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.user_profiles (user_id, singleton, name)
  values (new.id, true, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger intern_checker_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

comment on table public.tracked_applications is
  'Acompanhamento privado do usuário; pode referenciar uma vaga coletada ou conter uma vaga manual.';
comment on table public.application_stages is
  'Etapas ordenadas e editáveis de cada processo seletivo.';
comment on column public.jobs.status is
  'Legado: acompanhamento pessoal passou para tracked_applications na migration 008.';
