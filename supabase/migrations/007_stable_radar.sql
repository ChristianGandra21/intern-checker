alter table public.jobs
  add column display_tier text not null default 'hidden'
    check (display_tier in ('strong', 'watchlist', 'hidden')),
  add column target_fit text not null default 'unknown'
    check (target_fit in ('confirmed', 'probable', 'unknown', 'incompatible')),
  add column location_fit text not null default 'unknown'
    check (location_fit in ('confirmed', 'probable', 'unknown', 'incompatible')),
  add column display_reasons text[] not null default '{}',
  add column classification_version text not null default 'radar-v1',
  add column ai_error text,
  add column ai_last_attempt_at timestamptz;

create index jobs_radar_visible_idx
  on public.jobs (display_tier, score desc, discovered_at desc)
  where is_active = true and duplicate_of is null;

update public.jobs
set display_tier = case
      when verification_level in ('confirmed', 'probable') and is_active and duplicate_of is null then 'strong'
      else 'hidden'
    end,
    target_fit = case when match_start then 'probable' else 'unknown' end,
    location_fit = case when match_location then 'confirmed' else 'unknown' end,
    display_reasons = case
      when verification_level in ('confirmed', 'probable') and is_active and duplicate_of is null
        then array['classificação anterior preservada até a revalidação']::text[]
      else '{}'::text[]
    end;

create or replace function public.apply_job_radar_classification(payload jsonb)
returns integer
language plpgsql
as $$
declare
  affected integer;
begin
  update public.jobs as job
  set display_tier = incoming.display_tier,
      target_fit = incoming.target_fit,
      location_fit = incoming.location_fit,
      display_reasons = incoming.display_reasons,
      classification_version = incoming.classification_version
  from jsonb_to_recordset(payload) as incoming(
    id uuid,
    display_tier text,
    target_fit text,
    location_fit text,
    display_reasons text[],
    classification_version text
  )
  where job.id = incoming.id;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke execute on function public.apply_job_radar_classification(jsonb) from public, anon, authenticated;
grant execute on function public.apply_job_radar_classification(jsonb) to service_role;

comment on column public.jobs.display_tier is
  'strong = alta confiança; watchlist = oportunidade compatível com campos incertos; hidden = fora do radar';
comment on column public.jobs.target_fit is
  'Compatibilidade objetiva do ciclo com 2027.1; unknown não significa incompatível';
comment on column public.jobs.location_fit is
  'Compatibilidade objetiva com São Paulo ou remoto; unknown não significa incompatível';
