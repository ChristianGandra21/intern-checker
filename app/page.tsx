import { BookmarkCheck, BriefcaseBusiness, Radio, ShieldCheck, Telescope, Workflow } from "lucide-react";
import Link from "next/link";
import { DashboardAutoRefresh } from "@/components/dashboard-auto-refresh";
import { Filters } from "@/components/filters";
import { IngestionSummary } from "@/components/ingestion-summary";
import { JobList } from "@/components/job-list";
import { MetricCard } from "@/components/metric-card";
import { Pagination } from "@/components/pagination";
import { PendingSave } from "@/components/pending-save";
import { getDashboardData } from "@/lib/data";
import { currentTimestamp } from "@/lib/time";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const valueOf = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const selectedTier: "radar" | "strong" = valueOf(raw.tier) === "strong" ? "strong" : "radar";
  const values = { q: valueOf(raw.q), mode: valueOf(raw.mode), score: valueOf(raw.score), date_from: valueOf(raw.date_from), date_to: valueOf(raw.date_to), deadline: valueOf(raw.deadline), salary: valueOf(raw.salary), skill: valueOf(raw.skill), company: valueOf(raw.company), novelty: valueOf(raw.novelty), tier: selectedTier };
  const data = await getDashboardData({ query: values.q, mode: values.mode, minScore: Number(values.score ?? 0), discoveredFrom: values.date_from, discoveredTo: values.date_to, deadline: values.deadline as "open" | "7d" | "30d" | undefined, salary: values.salary === "informed" ? "informed" : undefined, skill: values.skill, company: values.company, novelty: values.novelty as "new" | "updated" | undefined, tier: values.tier, page: Number(valueOf(raw.page)) || 1, pageSize: 20 });
  const now = await currentTimestamp();
  const tabHref = (tier: "radar" | "strong") => {
    const params = new URLSearchParams();
    Object.entries({ ...values, tier }).forEach(([key, value]) => value && value !== "0" && params.set(key, value));
    return `/?${params.toString()}`;
  };

  return <>
    <PendingSave jobId={data.authenticated ? valueOf(raw.save) : undefined} />
    <main id="conteudo" className="shell pb-16 pt-6">
      {data.isDemo && <div className="enter mb-5 border-l-4 border-[var(--amber)] bg-[#fff4df] px-4 py-3 text-sm"><strong>Modo demonstração.</strong> Configure o Supabase para carregar e acompanhar vagas reais.</div>}
      <section className="enter grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumo das vagas">
        <MetricCard label="Novas hoje" value={data.metrics.newToday} note="capturadas no radar" icon={Radio} accent />
        <MetricCard label="Alta confiança" value={data.tierCounts.strong} note="verificadas e compatíveis" icon={ShieldCheck} />
        <MetricCard label="Vagas salvas" value={data.metrics.saved} note={data.authenticated ? "no seu acompanhamento" : "entre para acompanhar"} icon={BookmarkCheck} />
        <MetricCard label="Processos ativos" value={data.metrics.active} note={data.authenticated ? "em andamento agora" : "entre para acompanhar"} icon={Workflow} />
      </section>
      <IngestionSummary run={data.latestIngestionRun} canReview={data.canReviewIngestion} />

      <section className="enter enter-delay-1 mt-8" aria-labelledby="oportunidades-title">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><p className="eyebrow text-[var(--green)]">Fila priorizada</p><h1 id="oportunidades-title" className="mt-2 text-3xl font-semibold tracking-[-0.05em]">Oportunidades</h1></div>
          <div className="flex flex-wrap items-center justify-end gap-3"><span className="mono text-sm">{data.total} resultados</span><DashboardAutoRefresh running={data.latestIngestionRun?.status === "running"} /><Link prefetch={false} className="button-light" href="/api/export/csv">Baixar CSV</Link></div>
        </div>
        <nav className="mb-4 grid border border-[var(--ink)] bg-[var(--surface)] sm:grid-cols-2" aria-label="Nível de verificação">
          <Link href={tabHref("radar")} aria-current={values.tier === "radar" ? "page" : undefined} className={`group flex min-h-20 items-center gap-4 p-4 transition-colors ${values.tier === "radar" ? "bg-[var(--ink)] text-white" : "hover:bg-white"}`}>
            <span className={`grid size-11 shrink-0 place-items-center ${values.tier === "radar" ? "bg-[var(--acid)] text-[var(--ink)]" : "bg-[var(--paper)] text-[var(--green)]"}`}><Telescope size={20} /></span>
            <span><span className="block text-lg font-semibold">Radar amplo · {data.tierCounts.radar}</span><span className={`mt-1 block text-sm ${values.tier === "radar" ? "text-white/65" : "text-[var(--ink-soft)]"}`}>{data.tierCounts.watchlist} em verificação</span></span>
          </Link>
          <Link href={tabHref("strong")} aria-current={values.tier === "strong" ? "page" : undefined} className={`group flex min-h-20 items-center gap-4 border-t border-[var(--ink)] p-4 transition-colors sm:border-l sm:border-t-0 ${values.tier === "strong" ? "bg-[var(--green)] text-white" : "hover:bg-white"}`}>
            <span className={`grid size-11 shrink-0 place-items-center ${values.tier === "strong" ? "bg-white text-[var(--green)]" : "bg-[var(--paper)] text-[var(--green)]"}`}><BriefcaseBusiness size={20} /></span>
            <span><span className="block text-lg font-semibold">Alta confiança · {data.tierCounts.strong}</span><span className={`mt-1 block text-sm ${values.tier === "strong" ? "text-white/70" : "text-[var(--ink-soft)]"}`}>ciclo e localização compatíveis</span></span>
          </Link>
        </nav>
        <Filters values={values} />
        <div className="mt-4"><JobList jobs={data.jobs} isDemo={data.isDemo} authenticated={data.authenticated} savedJobIds={data.savedJobIds} now={now} /></div>
        <Pagination page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} params={values} />
      </section>
    </main>
    <footer className="border-t border-[var(--line)] py-6"><div className="shell flex flex-wrap justify-between gap-3 text-sm text-[var(--ink-soft)]"><span>Radar de Estágios</span><span className="mono">Next.js · Python · Supabase</span></div></footer>
  </>;
}
