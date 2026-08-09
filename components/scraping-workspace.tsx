"use client";

import { CheckCircle2, Clock3, Cloud, ExternalLink, HardDrive, LoaderCircle, Play, SearchCheck, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { ScrapingExecutionMode } from "@/lib/admin";
import type { ScrapeRun } from "@/lib/types";

const statusMeta = {
  queued: { label: "Na fila", icon: Clock3, className: "text-[var(--amber)]" },
  running: { label: "Executando", icon: LoaderCircle, className: "text-[var(--blue)]" },
  succeeded: { label: "Concluído", icon: CheckCircle2, className: "text-[var(--green)]" },
  failed: { label: "Falhou", icon: TriangleAlert, className: "text-[var(--red)]" },
};

function date(value: string | null) { return value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium" }).format(new Date(value)) : "—"; }
function duration(run: ScrapeRun) {
  if (!run.started_at) return "—";
  const end = run.finished_at ? Date.parse(run.finished_at) : Date.now();
  const seconds = Math.max(0, Math.round((end - Date.parse(run.started_at)) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}min ${seconds % 60}s`;
}

export function ScrapingWorkspace({ initial, mode }: { initial: ScrapeRun[]; mode: ScrapingExecutionMode }) {
  const [runs, setRuns] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const enabled = mode !== "disabled";
  const active = runs.some((run) => run.status === "queued" || run.status === "running");
  const refresh = useCallback(async () => {
    const response = await fetch("/api/scraping/runs", { cache: "no-store" });
    const data = await response.json() as { runs?: ScrapeRun[] };
    if (response.ok && data.runs) setRuns(data.runs);
  }, []);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, [active, refresh]);
  async function start() {
    setBusy(true); setMessage(null);
    const response = await fetch("/api/scraping/runs", { method: "POST" });
    const data = await response.json() as { error?: string };
    setMessage(response.ok ? "Coleta iniciada. Você pode sair desta página; ela continuará em segundo plano." : data.error || "Não foi possível iniciar a coleta.");
    await refresh(); setBusy(false);
  }
  return <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
    <section className="surface overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] bg-white p-5"><div><h2 className="text-2xl font-semibold tracking-[-.04em]">Histórico local</h2><p className="mt-1 text-sm text-[var(--ink-soft)]">Atualização automática durante a execução.</p></div>{active && <span className="eyebrow inline-flex items-center gap-2 text-[var(--blue)]"><LoaderCircle className="animate-spin" size={16} />Pipeline em andamento</span>}</div>
      {!runs.length ? <div className="grid min-h-64 place-items-center p-8 text-center"><div><SearchCheck className="mx-auto text-[var(--green)]" size={34} /><p className="mt-4 font-semibold">Nenhuma coleta manual registrada</p></div></div> : <div className="divide-y divide-[var(--line)]">{runs.map((run) => { const meta = statusMeta[run.status]; const Icon = meta.icon; const RunnerIcon = run.runner === "github" ? Cloud : HardDrive; return <article key={run.id} className="grid gap-4 p-5 md:grid-cols-[150px_1fr_150px] md:items-start"><div className={`flex items-center gap-2 font-semibold ${meta.className}`}><Icon className={run.status === "running" ? "animate-spin" : ""} size={18} />{meta.label}</div><div><div className="flex flex-wrap items-center gap-2"><p className="mono text-xs text-[var(--ink-soft)]">{run.id}</p><span className="eyebrow inline-flex items-center gap-1.5 border border-[var(--line)] bg-[var(--paper)] px-2 py-1 text-[9px]"><RunnerIcon size={12} />{run.runner === "github" ? "GitHub" : "Local"}</span></div><p className="mt-2 text-sm">Solicitada em {date(run.requested_at)}</p>{run.error_message && <p className="mt-2 text-sm font-medium text-[var(--red)]">{run.error_message}</p>}{run.summary && <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-[var(--green)]">Ver resumo técnico</summary><pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap bg-[var(--ink)] p-3 text-xs leading-relaxed text-white/75">{run.summary}</pre></details>}</div><div className="text-sm text-[var(--ink-soft)]"><p>Duração</p><p className="mono mt-1 text-[var(--ink)]">{duration(run)}</p>{run.external_url && <a href={run.external_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-10 items-center gap-1.5 font-semibold text-[var(--green)] hover:underline">Abrir logs <ExternalLink size={14} /></a>}</div></article>; })}</div>}
    </section>
    <aside className="surface h-fit overflow-hidden xl:sticky xl:top-6"><div className="bg-[var(--ink)] p-6 text-white"><p className="eyebrow text-[var(--acid)]">Ação administrativa</p><h2 className="mt-2 text-2xl font-semibold">Atualizar radar</h2><p className="mt-3 text-sm leading-relaxed text-white/65">Executa coleta, ingestão e revalidação {mode === "github" ? "no GitHub Actions" : mode === "local" ? "nesta máquina" : "quando um executor for configurado"}.</p></div><div className="p-6"><div className="mb-4 flex items-center gap-2 border border-[var(--line)] bg-white p-3 text-sm"><span className="grid size-9 place-items-center bg-[var(--paper)] text-[var(--green)]">{mode === "github" ? <Cloud size={17} /> : <HardDrive size={17} />}</span><span><span className="eyebrow block text-[var(--ink-soft)]">Executor</span><strong>{mode === "github" ? "GitHub Actions" : mode === "local" ? "Processo local" : "Desabilitado"}</strong></span></div><button type="button" onClick={start} disabled={!enabled || active || busy} className="button-dark w-full">{busy || active ? <LoaderCircle className="animate-spin" size={18} /> : <Play size={18} />} {active ? "Coleta em andamento" : "Rodar scraping agora"}</button><p className="mt-3 text-xs leading-relaxed text-[var(--ink-soft)]">{enabled ? "Há um intervalo mínimo de 30 minutos, apenas uma execução simultânea e nenhum alerta manual." : "Configure SCRAPING_EXECUTION_MODE para habilitar a coleta."}</p>{message && <p className={`mt-4 border-l-4 p-3 text-sm ${/iniciada/.test(message) ? "border-[var(--green)] bg-[#e8f5ef]" : "border-[var(--red)] bg-[#fff0ee]"}`} role="status">{message}</p>}</div></aside>
  </div>;
}
