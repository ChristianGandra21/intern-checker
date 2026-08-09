alter table public.jobs
  add column area_fit text not null default 'ambiguous'
    check (area_fit in ('tech', 'general', 'non_tech', 'ambiguous')),
  add column area_reasons text[] not null default '{}';

update public.jobs
set area_fit = case when match_area then 'tech' else 'ambiguous' end;

create index jobs_area_fit_idx on public.jobs (area_fit, verification_level, is_active)
where duplicate_of is null;

comment on column public.jobs.area_fit is
  'tech = aderente; general = programa amplo; non_tech = fora do foco; ambiguous = requer revisão';
