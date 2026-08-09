alter table public.tracked_applications
  add column if not exists application_state text not null default 'not_applied';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tracked_applications_application_state_check'
  ) then
    alter table public.tracked_applications
      add constraint tracked_applications_application_state_check
      check (application_state in ('not_applied', 'applied', 'rejected', 'accepted'));
  end if;
end $$;

update public.tracked_applications
set application_state = case status
  when 'active' then 'applied'
  when 'offer' then 'accepted'
  when 'rejected' then 'rejected'
  else 'not_applied'
end
where application_state = 'not_applied';

alter table public.application_stages
  add column if not exists milestone text not null default 'none';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'application_stages_milestone_check'
  ) then
    alter table public.application_stages
      add constraint application_stages_milestone_check
      check (milestone in ('none', 'application_submitted'));
  end if;
end $$;

update public.application_stages
set milestone = 'application_submitted'
where milestone = 'none'
  and (position = 1 or lower(name) like '%inscri%enviad%');

create index if not exists tracked_applications_user_state_idx
  on public.tracked_applications (user_id, application_state, updated_at desc)
  where status <> 'archived';

comment on column public.tracked_applications.application_state is
  'Situação objetiva: ainda não se inscreveu, inscrito, reprovado ou aprovado.';
comment on column public.application_stages.milestone is
  'Marco estável usado por automações mesmo quando a etapa é renomeada.';
