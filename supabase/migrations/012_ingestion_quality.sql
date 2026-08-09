alter table public.ingestion_runs
  add column if not exists persisted_count integer not null default 0,
  add column if not exists review_count integer not null default 0,
  add column if not exists rejected_count integer not null default 0,
  add column if not exists hidden_count integer not null default 0,
  add column if not exists resolved_count integer not null default 0,
  add column if not exists failure_count integer not null default 0,
  add column if not exists duration_ms integer;

alter table public.source_runs
  add column if not exists persisted_count integer not null default 0,
  add column if not exists review_count integer not null default 0,
  add column if not exists rejected_count integer not null default 0,
  add column if not exists hidden_count integer not null default 0,
  add column if not exists failure_count integer not null default 0,
  add column if not exists duration_ms integer;

create unique index if not exists source_runs_run_source_idx
  on public.source_runs (ingestion_run_id, source);

comment on column public.ingestion_runs.persisted_count is
  'Total de oportunidades canônicas persistidas em todos os lotes da execução.';
comment on column public.ingestion_runs.hidden_count is
  'Total classificado como oculto pelo backend autoritativo.';
