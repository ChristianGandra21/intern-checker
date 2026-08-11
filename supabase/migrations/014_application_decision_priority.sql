alter table public.tracked_applications
  add column if not exists decision_priority_enabled boolean not null default false,
  add column if not exists decision_priority_score smallint
    check (decision_priority_score is null or decision_priority_score between 0 and 100),
  add column if not exists decision_priority_criteria jsonb not null default '{}'
    check (jsonb_typeof(decision_priority_criteria) = 'object');

create index if not exists tracked_applications_decision_priority_idx
  on public.tracked_applications (user_id, decision_priority_score desc, updated_at desc)
  where decision_priority_enabled = true and decision_priority_score is not null and deleted_at is null;

comment on column public.tracked_applications.decision_priority_enabled is
  'Ativa opcionalmente a nota pessoal e explicável para tomada de decisão';
comment on column public.tracked_applications.decision_priority_score is
  'Média normalizada de 0 a 100 somente entre os critérios pessoais respondidos';
comment on column public.tracked_applications.decision_priority_criteria is
  'Avaliações pessoais de 1 a 5 usadas no cálculo da nota de decisão';
