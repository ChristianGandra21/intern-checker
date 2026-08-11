alter table public.tracked_applications
  add column if not exists company_context text not null default '',
  add column if not exists company_culture text not null default '',
  add column if not exists company_reviews text not null default '',
  add column if not exists application_resume_text text not null default '',
  add column if not exists candidate_pitch text not null default '';

alter table public.application_recommendations
  add column if not exists overall_assessment text not null default '',
  add column if not exists company_culture_assessment text[] not null default '{}',
  add column if not exists pitch_strengths text[] not null default '{}',
  add column if not exists pitch_improvements text[] not null default '{}',
  add column if not exists analyzed_resume boolean not null default false,
  add column if not exists analyzed_pitch boolean not null default false;

comment on column public.tracked_applications.company_context is
  'Informações sobre a empresa fornecidas pelo usuário para preparar a candidatura';
comment on column public.tracked_applications.company_culture is
  'Sinais de cultura e valores fornecidos pelo usuário, sem verificação automática';
comment on column public.tracked_applications.company_reviews is
  'Opiniões e relatos copiados pelo usuário; tratados como percepções, não fatos';
comment on column public.tracked_applications.application_resume_text is
  'Versão opcional do currículo específica para esta candidatura';
comment on column public.tracked_applications.candidate_pitch is
  'Pitch pessoal opcional submetido para receber feedback consultivo';
comment on column public.application_recommendations.analyzed_resume is
  'Indica que o usuário incluiu a análise de currículo neste diagnóstico';
comment on column public.application_recommendations.analyzed_pitch is
  'Indica que o usuário incluiu a análise de pitch neste diagnóstico';
