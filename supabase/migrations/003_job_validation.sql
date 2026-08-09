alter table public.jobs
  add column candidate_kind text not null default 'lead'
    check (candidate_kind in ('job', 'lead', 'noise')),
  add column quality_score smallint not null default 0
    check (quality_score between 0 and 100),
  add column validation_status text not null default 'review'
    check (validation_status in ('accepted', 'review', 'rejected')),
  add column validation_reasons text[] not null default '{}',
  add column is_active boolean not null default true,
  add column canonical_key text,
  add column identity_key text,
  add column last_checked_at timestamptz,
  add column duplicate_of uuid references public.jobs(id) on delete set null;

create index jobs_visible_idx
  on public.jobs (validation_status, is_active, score desc, discovered_at desc)
  where duplicate_of is null;
create index jobs_canonical_key_idx on public.jobs (canonical_key);
create index jobs_identity_key_idx on public.jobs (identity_key);
create index jobs_duplicate_of_idx on public.jobs (duplicate_of);

comment on column public.jobs.candidate_kind is
  'job = anúncio aplicável; lead = notícia/post a enriquecer; noise = conteúdo sem vaga';
comment on column public.jobs.validation_status is
  'accepted aparece na fila; review fica em quarentena; rejected é preservado para auditoria';
