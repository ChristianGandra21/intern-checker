"use client";

import { AlertTriangle, ArrowUpRight, CheckCircle2, EyeOff, LoaderCircle, Radar, RefreshCcw, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import type { IngestionRun } from "@/lib/types";

const DISMISSED_RUN_KEY = "intern-checker:dismissed-ingestion-summary";
const DISMISSED_RUN_EVENT = "intern-checker:dismissed-ingestion-summary-change";
let volatileDismissedRunId: string | null = null;

function dismissedRunSnapshot() {
  try {
    return window.localStorage.getItem(DISMISSED_RUN_KEY) || volatileDismissedRunId;
  } catch {
    return volatileDismissedRunId;
  }
}

function subscribeToDismissedRun(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(DISMISSED_RUN_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(DISMISSED_RUN_EVENT, callback);
  };
}

const statusMeta = {
  running: { label: "Coleta em andamento", icon: LoaderCircle, color: "text-[var(--blue)]", surface: "bg-[#eaf3fb]" },
  success: { label: "Coleta concluída", icon: CheckCircle2, color: "text-[var(--green)]", surface: "bg-[#e8f5ef]" },
  failed: { label: "Coleta com falha", icon: AlertTriangle, color: "text-[var(--red)]", surface: "bg-[#fff0ee]" },
} as const;

function date(value: string | null) {
  if (!value) return "agora";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function duration(run: IngestionRun) {
  const milliseconds = run.duration_ms ?? Math.max(0, Date.parse(run.finished_at || new Date().toISOString()) - Date.parse(run.started_at));
  const seconds = Math.round(milliseconds / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}min ${seconds % 60}s`;
}

export function IngestionSummary({ run, canReview }: { run: IngestionRun | null; canReview: boolean }) {
  const dismissedRunId = useSyncExternalStore(subscribeToDismissedRun, dismissedRunSnapshot, () => null);
  if (!run || dismissedRunId === run.id) return null;
  const dismiss = () => {
    volatileDismissedRunId = run.id;
    try {
      window.localStorage.setItem(DISMISSED_RUN_KEY, run.id);
    } catch {
      // A ocultação ainda funciona nesta sessão quando o armazenamento está indisponível.
    }
    window.dispatchEvent(new Event(DISMISSED_RUN_EVENT));
  };
  const meta = statusMeta[run.status];
  const StatusIcon = meta.icon;
  const metrics = [
    { label: "Novas no banco", value: run.created_count, icon: Sparkles },
    { label: "Novas no radar", value: run.new_radar_count, icon: Radar },
    { label: "Atualizadas", value: run.updated_count, icon: RefreshCcw },
    { label: "Ocultas", value: run.hidden_count, icon: EyeOff },
  ];
  return (
    <section className="enter enter-delay-1 surface relative mt-6 overflow-hidden" aria-labelledby="latest-ingestion-title">
      <button type="button" onClick={dismiss} className="button-quiet absolute right-2 top-2 z-10 size-11 p-0" aria-label="Ocultar resumo desta coleta" title="Ocultar resumo"><X size={17} aria-hidden="true" /></button>
      <div className="grid lg:grid-cols-[minmax(260px,.75fr)_minmax(0,1.7fr)]">
        <div className={`${meta.surface} border-b border-[var(--line)] p-5 pr-14 lg:border-b-0 lg:border-r`}>
          <p className={`eyebrow flex items-center gap-2 ${meta.color}`}>
            <StatusIcon className={run.status === "running" ? "animate-spin" : ""} size={16} aria-hidden="true" />
            {meta.label}
          </p>
          <h2 id="latest-ingestion-title" className="mt-3 text-2xl font-semibold tracking-[-.04em]">Última coleta</h2>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">{date(run.finished_at || run.started_at)} · {duration(run)}</p>
          {run.status === "failed" && <p className="mt-3 text-sm font-medium text-[var(--red)]">A execução não terminou. Consulte a auditoria para os detalhes técnicos.</p>}
          {canReview && <Link href={`/scraping/${run.id}`} className="mt-4 inline-flex min-h-11 items-center gap-2 font-semibold text-[var(--green)] hover:underline">Revisar coleta <ArrowUpRight size={16} aria-hidden="true" /></Link>}
        </div>
        <div className="p-5">
          <p className="text-sm leading-relaxed text-[var(--ink-soft)]">
            <strong className="text-[var(--ink)]">{run.created_count} novas no banco</strong>, {run.new_radar_count} novas no radar e {run.hidden_count} ocultas para revisão.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-px border border-[var(--line)] bg-[var(--line)] sm:grid-cols-4">
            {metrics.map(({ label, value, icon: Icon }) => <div key={label} className="bg-[var(--surface)] p-4"><Icon className="text-[var(--green)]" size={17} aria-hidden="true" /><p className="mono mt-3 text-2xl font-semibold">{value}</p><p className="eyebrow mt-1 text-[10px] text-[var(--ink-soft)]">{label}</p></div>)}
          </div>
          <p className="mono mt-3 text-xs leading-relaxed text-[var(--ink-soft)]">{run.found_count} encontradas · {run.persisted_count} persistidas · {run.strong_count} fortes · {run.watchlist_count} em análise · {run.duplicate_count} duplicadas · {run.failure_count} falhas</p>
        </div>
      </div>
    </section>
  );
}
