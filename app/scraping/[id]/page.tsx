import { ArrowLeft, BarChart3, EyeOff, FileWarning, Layers3, RefreshCcw, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { JobReviewForm } from "@/components/job-review-form";
import { isScrapingAdmin } from "@/lib/admin";
import { requireUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { IngestionRun, Job } from "@/lib/types";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function ScrapingReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const user = await requireUser().catch(() => null);
  const { id } = await params;
  if (!user) redirect(`/login?next=/scraping/${id}`);
  if (!isScrapingAdmin(user)) notFound();
  const filters = await searchParams;
  const source = one(filters.source) || "";
  const tier = one(filters.tier) || "";
  const reason = one(filters.reason)?.toLocaleLowerCase("pt-BR") || "";
  const db = getSupabaseAdmin();
  const scrape = await db.from("scrape_runs").select("*").eq("id", id).maybeSingle();
  if (scrape.error) notFound();
  const ingestion = scrape.data?.ingestion_run_id
    ? await db.from("ingestion_runs").select("*").eq("id", scrape.data.ingestion_run_id).maybeSingle()
    : await db.from("ingestion_runs").select("*").eq("id", id).maybeSingle();
  if (!scrape.data && !ingestion.data) notFound();
  const run = ingestion.data as IngestionRun | null;
  const sourceRuns = run ? await db.from("source_runs").select("*").eq("ingestion_run_id", run.id).order("discovered_count", { ascending: false }) : { data: [] };
  let jobs: Job[] = [];
  if (run) {
    const rows = await db.from("jobs").select("*").gte("last_seen_at", run.started_at).order("display_tier").order("last_seen_at", { ascending: false }).limit(1000);
    jobs = (rows.data || []) as Job[];
  }
  const sources = [...new Set(jobs.map((job) => job.source))].sort();
  const filtered = jobs.filter((job) => (!source || job.source === source) && (!tier || job.display_tier === tier)
    && (!reason || [...(job.display_reasons || []), ...(job.validation_reasons || [])].join(" ").toLocaleLowerCase("pt-BR").includes(reason)));
  const metrics = [
    ["Encontradas", run?.found_count || 0, Layers3], ["Novas", run?.created_count || 0, Sparkles],
    ["Atualizadas", run?.updated_count || 0, RefreshCcw], ["Fortes", run?.strong_count || 0, BarChart3],
    ["Em análise", run?.watchlist_count || 0, FileWarning], ["Ocultas", run?.hidden_count || 0, EyeOff],
  ] as const;
  return <main id="conteudo" className="shell pb-20 pt-8">
    <Link href="/scraping" className="mb-6 inline-flex min-h-11 items-center gap-2 font-semibold text-[var(--green)] hover:underline"><ArrowLeft size={17} />Voltar às coletas</Link>
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--ink)] pb-6"><div><p className="eyebrow text-[var(--green)]">Auditoria da execução</p><h1 className="mt-2 text-4xl font-bold tracking-[-.06em] sm:text-5xl">O que mudou no radar</h1><p className="mono mt-3 text-xs text-[var(--ink-soft)]">{run?.id || "A coleta ainda não abriu uma execução de ingestão."}</p></div><a href="/api/admin/review/fixtures" className="button-light" download>Exportar dataset de regressão</a></header>
    <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-6">{metrics.map(([label, value, Icon]) => <article key={label} className="border border-[var(--line)] bg-white p-4"><Icon className="text-[var(--green)]" size={20} /><p className="mono mt-4 text-2xl font-semibold">{value}</p><p className="eyebrow mt-1 text-[var(--ink-soft)]">{label}</p></article>)}</section>
    {run && <>
      <form className="surface mt-6 grid gap-3 p-4 md:grid-cols-[1fr_1fr_1.4fr_auto]"><select className="field" name="source" defaultValue={source}><option value="">Todas as fontes</option>{sources.map((value) => <option key={value}>{value}</option>)}</select><select className="field" name="tier" defaultValue={tier}><option value="">Todas as decisões</option><option value="strong">Fortes</option><option value="watchlist">Em análise</option><option value="hidden">Ocultas</option></select><input className="field" name="reason" defaultValue={one(filters.reason)} placeholder="Buscar nos motivos" /><button className="button-dark">Filtrar</button></form>
      <section className="surface mt-6 overflow-hidden"><div className="border-b border-[var(--line)] bg-[var(--ink)] p-5 text-white"><h2 className="text-2xl font-semibold">Decisões da execução</h2><p className="mt-1 text-sm text-white/60">{filtered.length} oportunidades canônicas neste recorte.</p></div><div className="divide-y divide-[var(--line)]">{filtered.slice(0, 150).map((job) => <article key={job.id}><div className="grid gap-3 p-5 lg:grid-cols-[1fr_180px]"><div><div className="flex flex-wrap items-center gap-2"><span className={`eyebrow px-2 py-1 text-[10px] ${job.display_tier === "strong" ? "bg-[var(--green)] text-white" : job.display_tier === "watchlist" ? "bg-[var(--acid)]" : "bg-[var(--line)]"}`}>{job.display_tier}</span><span className="eyebrow text-[var(--ink-soft)]">{job.source}</span></div><Link href={`/jobs/${job.id}`} className="mt-3 inline-block text-lg font-semibold hover:underline">{job.title}</Link><p className="text-sm text-[var(--green)]">{job.company}</p><p className="mt-2 text-sm text-[var(--ink-soft)]">{[...(job.display_reasons || []), ...(job.validation_reasons || [])].slice(0, 5).join(" · ")}</p></div><div className="mono text-xs text-[var(--ink-soft)]"><p>{job.candidate_kind}</p><p className="mt-2">{job.location || "sem localização"}</p><p className="mt-2">score {job.quality_score}</p></div></div><JobReviewForm job={job} ingestionRunId={run.id} /></article>)}</div></section>
      <section className="surface mt-6 overflow-hidden"><div className="border-b border-[var(--line)] p-5"><h2 className="text-xl font-semibold">Rendimento por fonte</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[var(--paper)]"><tr>{["Fonte", "Encontradas", "Persistidas", "Fortes", "Análise", "Ocultas", "Falhas"].map((label) => <th key={label} className="p-3 eyebrow">{label}</th>)}</tr></thead><tbody>{(sourceRuns.data || []).map((row) => <tr key={row.id} className="border-t border-[var(--line)]"><td className="p-3 font-semibold">{row.source}</td><td className="p-3 mono">{row.discovered_count}</td><td className="p-3 mono">{row.persisted_count}</td><td className="p-3 mono">{row.strong_count ?? row.accepted_count}</td><td className="p-3 mono">{row.watchlist_count ?? row.review_count}</td><td className="p-3 mono">{row.hidden_count}</td><td className="p-3 mono">{row.failure_count}</td></tr>)}</tbody></table></div></section>
    </>}
  </main>;
}
