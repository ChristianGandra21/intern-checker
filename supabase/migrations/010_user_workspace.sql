create table if not exists public.user_job_decisions (
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  decision text not null default 'declined' check (decision in ('declined')),
  reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

alter table public.tracked_applications
  add column if not exists deleted_at timestamptz;

create table if not exists public.scrape_runs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed')),
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  exit_code integer,
  summary text not null default '',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_job_decisions_user_created_idx
  on public.user_job_decisions (user_id, created_at desc);
create index if not exists tracked_applications_deleted_idx
  on public.tracked_applications (user_id, deleted_at desc)
  where deleted_at is not null;
create index if not exists scrape_runs_requested_idx
  on public.scrape_runs (requested_at desc);
create unique index if not exists scrape_runs_one_active_idx
  on public.scrape_runs ((true)) where status in ('queued', 'running');

drop trigger if exists user_job_decisions_set_updated_at on public.user_job_decisions;
create trigger user_job_decisions_set_updated_at before update on public.user_job_decisions
for each row execute function public.set_updated_at();
drop trigger if exists scrape_runs_set_updated_at on public.scrape_runs;
create trigger scrape_runs_set_updated_at before update on public.scrape_runs
for each row execute function public.set_updated_at();

alter table public.user_job_decisions enable row level security;
alter table public.scrape_runs enable row level security;

drop policy if exists user_job_decisions_own_all on public.user_job_decisions;
create policy user_job_decisions_own_all on public.user_job_decisions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Execuções são criadas e atualizadas somente pelas rotas administrativas com service role.
-- O usuário não acessa esta tabela diretamente pelo navegador.

create or replace function public.purge_expired_tracked_applications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  delete from public.tracked_applications
  where deleted_at is not null and deleted_at < now() - interval '30 days';
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke execute on function public.purge_expired_tracked_applications() from public, anon, authenticated;
grant execute on function public.purge_expired_tracked_applications() to service_role;

comment on table public.user_job_decisions is
  'Preferências por usuário sobre vagas globais; dispensa não significa reprovação pela empresa.';
comment on column public.tracked_applications.deleted_at is
  'Lixeira pessoal. Registros são removidos definitivamente após 30 dias.';
comment on table public.scrape_runs is
  'Auditoria de coletas locais disparadas por administradores na interface.';
