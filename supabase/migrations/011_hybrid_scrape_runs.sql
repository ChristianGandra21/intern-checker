alter table public.scrape_runs
  add column if not exists runner text not null default 'local',
  add column if not exists external_run_id text,
  add column if not exists external_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'scrape_runs_runner_check'
  ) then
    alter table public.scrape_runs
      add constraint scrape_runs_runner_check check (runner in ('local', 'github'));
  end if;
end $$;

comment on column public.scrape_runs.runner is
  'Executor usado pela coleta administrativa: processo local ou GitHub Actions.';
comment on column public.scrape_runs.external_run_id is
  'Identificador da execução no provedor externo, quando disponível.';
comment on column public.scrape_runs.external_url is
  'URL administrativa para acompanhar os logs no provedor externo.';
comment on table public.scrape_runs is
  'Auditoria de coletas sob demanda disparadas por administradores, localmente ou via GitHub Actions.';
