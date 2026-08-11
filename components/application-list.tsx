import { ArrowRight, CalendarClock, CalendarDays, CircleAlert, Gauge, Plus, Search } from "lucide-react";
import Link from "next/link";
import { ApplicationStateBadge, applicationStateOptions } from "@/components/application-state-badge";
import { formatSaoPauloDateTime } from "@/lib/date-time";
import { decisionPriorityLabel } from "@/lib/application-priority";
import type { TrackedApplication } from "@/lib/types";

function saoPauloDateKey(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const part = (type: "year" | "month" | "day") => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function ApplicationList({ applications, values, now }: { applications: TrackedApplication[]; values: { q?: string; applicationState?: string; timing?: string; dateFrom?: string; dateTo?: string; order?: string }; now: number }) {
  const inSevenDays = now + 7 * 24 * 60 * 60 * 1000;
  const query = values.q?.toLocaleLowerCase("pt-BR").trim();
  const filtered = applications.filter((application) => {
    const stages = application.application_stages || [];
    const nextDate = stages.filter((stage) => stage.scheduled_at && !["completed", "skipped"].includes(stage.state)).map((stage) => Date.parse(stage.scheduled_at!)).sort()[0];
    const deadline = application.application_deadline ? Date.parse(application.application_deadline) : null;
    const includedDate = saoPauloDateKey(application.created_at);
    const matchesTiming = !values.timing || (values.timing === "week" && nextDate && nextDate >= now && nextDate <= inSevenDays) || (values.timing === "overdue" && ((deadline && deadline < now) || (nextDate && nextDate < now)));
    return (!query || `${application.title} ${application.company} ${application.description}`.toLocaleLowerCase("pt-BR").includes(query))
      && (!values.applicationState || application.application_state === values.applicationState)
      && (!values.dateFrom || includedDate >= values.dateFrom)
      && (!values.dateTo || includedDate <= values.dateTo)
      && matchesTiming;
  });
  const visible = values.order === "decision"
    ? [...filtered].sort((left, right) => (right.decision_priority_score ?? -1) - (left.decision_priority_score ?? -1) || Date.parse(right.updated_at) - Date.parse(left.updated_at))
    : filtered;

  return <>
    <form className="surface mb-5 grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_180px_160px_150px_150px_180px_auto]">
      <label className="relative"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--ink-soft)]" size={17} /><span className="sr-only">Buscar processo</span><input name="q" defaultValue={values.q} className="field pl-11" placeholder="Empresa, vaga ou descrição" /></label>
      <label><span className="sr-only">Situação</span><select name="application_state" defaultValue={values.applicationState || ""} className="field"><option value="">Todas as situações</option>{applicationStateOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label><span className="sr-only">Prazo</span><select name="timing" defaultValue={values.timing || ""} className="field"><option value="">Qualquer data</option><option value="week">Próximos 7 dias</option><option value="overdue">Atrasadas</option></select></label>
      <label><span className="sr-only">Ordenação</span><select name="order" defaultValue={values.order || "recent"} className="field"><option value="recent">Mais recentes</option><option value="decision">Maior nota de decisão</option></select></label>
      <label><span className="eyebrow mb-1.5 flex items-center gap-1.5 text-[var(--ink-soft)]"><CalendarDays size={14} />Adicionada desde</span><input className="field" type="date" name="date_from" defaultValue={values.dateFrom} max={values.dateTo} /></label>
      <label><span className="eyebrow mb-1.5 block text-[var(--ink-soft)]">Adicionada até</span><input className="field" type="date" name="date_to" defaultValue={values.dateTo} min={values.dateFrom} /></label>
      <button className="button-dark self-end">Filtrar</button>
    </form>
    {!visible.length ? <div className="surface grid min-h-64 place-items-center p-8 text-center"><div><CalendarClock className="mx-auto text-[var(--green)]" size={34} /><h2 className="mt-4 text-2xl font-semibold">Nenhum processo neste recorte</h2><p className="mt-2 text-[var(--ink-soft)]">Salve uma vaga do radar ou cadastre uma oportunidade manualmente.</p><Link href="/applications/new" className="button-dark mt-5"><Plus size={17} />Adicionar vaga</Link></div></div> : <div className="grid gap-3">
      {visible.map((application) => {
        const stages = application.application_stages || [];
        const current = stages.find((stage) => stage.state === "current") || stages.find((stage) => stage.state === "pending");
        const completed = stages.filter((stage) => stage.state === "completed").length;
        const progress = stages.length ? Math.round(completed / stages.length * 100) : 0;
        const nextDate = stages.filter((stage) => stage.scheduled_at && !["completed", "skipped"].includes(stage.state)).sort((a, b) => Date.parse(a.scheduled_at!) - Date.parse(b.scheduled_at!))[0];
        const overdue = Boolean((application.application_deadline && Date.parse(application.application_deadline) < now) || (nextDate?.scheduled_at && Date.parse(nextDate.scheduled_at) < now));
        return <article key={application.id} className="surface group relative overflow-hidden p-5 transition-transform duration-200 hover:-translate-y-0.5 hover:bg-white sm:p-6">
          <span className="absolute inset-y-0 left-0 w-1 bg-[var(--green)] opacity-0 transition-opacity group-hover:opacity-100" />
          <div className="grid gap-5 lg:grid-cols-[minmax(280px,1.6fr)_minmax(190px,.75fr)_minmax(220px,.9fr)_48px] lg:items-center">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><ApplicationStateBadge state={application.application_state} long />{!application.job_id && <span className="eyebrow border border-[var(--line)] px-2 py-1 text-[9px]">Manual</span>}{application.decision_priority_enabled && application.decision_priority_score !== null && application.decision_priority_score !== undefined && <span className="eyebrow inline-flex items-center gap-1.5 border border-[var(--green)] bg-[#e8f5ef] px-2 py-1 text-[9px] text-[var(--green)]"><Gauge size={12} />{decisionPriorityLabel(application.decision_priority_score)} · {application.decision_priority_score}/100</span>}</div><Link href={`/applications/${application.id}`} className="mt-3 block text-xl font-semibold leading-tight tracking-[-.025em] hover:underline">{application.title}</Link><p className="mt-1 text-sm font-semibold text-[var(--green)]">{application.company}</p><p className="mt-3 line-clamp-2 max-w-3xl text-sm leading-relaxed text-[var(--ink-soft)]">{application.description || "Descrição ainda não cadastrada."}</p></div>
            <div><div className="flex items-end justify-between gap-3"><div><p className="eyebrow text-[var(--ink-soft)]">Etapa atual</p><p className="mt-1 text-sm font-semibold">{current?.name || "Fluxo concluído"}</p></div><span className="mono text-xs text-[var(--ink-soft)]">{completed}/{stages.length}</span></div><div className="mt-3 h-2 overflow-hidden bg-[var(--line)]"><span className="block h-full bg-[var(--green)]" style={{ width: `${progress}%` }} /></div></div>
            <div className="grid gap-2 text-sm"><p><span className="eyebrow block text-[var(--ink-soft)]">Adicionada</span><span className="mt-1 block">{formatSaoPauloDateTime(application.created_at)}</span></p><p><span className="eyebrow block text-[var(--ink-soft)]">Próxima etapa</span><span className={`mt-1 flex items-center gap-1.5 ${nextDate?.scheduled_at && Date.parse(nextDate.scheduled_at) < now ? "font-semibold text-[var(--red)]" : ""}`}>{nextDate?.scheduled_at && Date.parse(nextDate.scheduled_at) < now && <CircleAlert size={15} />}{formatSaoPauloDateTime(nextDate?.scheduled_at)}</span></p><p><span className="eyebrow block text-[var(--ink-soft)]">Prazo da vaga</span><span className={`mt-1 flex items-center gap-1.5 ${overdue && application.application_deadline && Date.parse(application.application_deadline) < now ? "font-semibold text-[var(--red)]" : ""}`}>{application.application_deadline && Date.parse(application.application_deadline) < now && <CircleAlert size={15} />}{formatSaoPauloDateTime(application.application_deadline)}</span></p></div>
            <Link href={`/applications/${application.id}`} className="grid size-12 place-items-center border border-[var(--ink)] transition-colors hover:bg-[var(--ink)] hover:text-white" aria-label={`Abrir ${application.title}`}><ArrowRight size={18} /></Link>
          </div>
        </article>;
      })}
    </div>}
  </>;
}
