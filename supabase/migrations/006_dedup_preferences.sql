alter table public.jobs
  add column dedup_group_key text,
  add column dedup_confidence smallint not null default 0 check (dedup_confidence between 0 and 100),
  add column dedup_reasons text[] not null default '{}',
  add column primary_area text not null default 'ambiguous',
  add column area_tags text[] not null default '{}';

alter table public.user_profiles
  add column excluded_area_categories text[] not null default '{}',
  add column excluded_area_terms text[] not null default '{}';

create index jobs_dedup_group_key_idx on public.jobs (dedup_group_key) where dedup_group_key is not null;
create index jobs_primary_area_idx on public.jobs (primary_area, verification_level, is_active) where duplicate_of is null;
create index jobs_area_tags_idx on public.jobs using gin (area_tags);

comment on column public.jobs.dedup_group_key is
  'Identidade global compartilhada pelo registro canônico e suas duplicatas';
comment on column public.jobs.primary_area is
  'Categoria funcional principal usada nas preferências pessoais';
comment on column public.user_profiles.excluded_area_categories is
  'Categorias ocultadas somente nas saídas; a ingestão preserva os registros';
