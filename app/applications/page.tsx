import { CheckCircle2, Download, Send, Target, Trophy, Plus } from "lucide-react";
import Link from "next/link";
import { ApplicationList } from "@/components/application-list";
import { ApplicationInsights } from "@/components/application-insights";
import { getApplications } from "@/lib/application-data";
import { currentTimestamp } from "@/lib/time";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const valueOf = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function ApplicationsPage({ searchParams }: { searchParams: SearchParams }) {
  const [applications, raw, now] = await Promise.all([getApplications(), searchParams, currentTimestamp()]);
  const applied = applications.filter((item) => ["applied", "rejected", "accepted"].includes(item.application_state)).length;
  const interviews = applications.filter((item) => (item.application_stages || []).some((stage) => /entrevista/i.test(stage.name) && stage.state === "completed")).length;
  const offers = applications.filter((item) => item.application_state === "accepted").length;
  const conversion = applied ? Math.round(offers / applied * 100) : 0;
  const metrics = [["Inscrições", applied, Send], ["Entrevistas", interviews, Target], ["Aprovações", offers, Trophy], ["Conversão", `${conversion}%`, CheckCircle2]] as const;
  return <main id="conteudo" className="shell pb-20 pt-8">
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--ink)] pb-6"><div><p className="eyebrow text-[var(--green)]">Área privada</p><h1 className="mt-2 text-4xl font-bold tracking-[-.065em] sm:text-5xl">Minhas vagas</h1><p className="mt-3 text-[var(--ink-soft)]">{applications.length} oportunidades sob acompanhamento.</p></div><div className="flex flex-wrap gap-2"><a href="/api/applications/export/xlsx" className="button-light" download><Download size={18} />Baixar XLSX</a><Link href="/applications/new" className="button-dark"><Plus size={18} />Adicionar vaga</Link></div></div>
    <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">{metrics.map(([label, value, Icon]) => <article key={label} className="border border-[var(--line)] bg-white p-4"><Icon className="text-[var(--green)]" size={20} /><p className="mono mt-4 text-2xl font-semibold">{String(value)}</p><p className="eyebrow mt-1 text-[var(--ink-soft)]">{label}</p></article>)}</section>
    <ApplicationInsights applications={applications} />
    <ApplicationList applications={applications} now={now} values={{ q: valueOf(raw.q), applicationState: valueOf(raw.application_state), timing: valueOf(raw.timing), dateFrom: valueOf(raw.date_from), dateTo: valueOf(raw.date_to), order: valueOf(raw.order) }} />
  </main>;
}
