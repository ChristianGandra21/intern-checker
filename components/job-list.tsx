"use client";

import { ArchiveX, ArrowUpRight, BriefcaseBusiness, LoaderCircle, MapPin, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Job } from "@/lib/types";
import { SaveJobButton } from "./save-job-button";

const modeLabel = { remote: "Remoto", hybrid: "Híbrido", onsite: "Presencial", unknown: "Não informado" };

function formatDate(value: string | null) {
  if (!value) return "data não informada";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(value));
}

function Score({ value }: { value: number }) {
  const color = value >= 80 ? "bg-[var(--green)] text-white" : value >= 60 ? "bg-[var(--acid)] text-[var(--ink)]" : "bg-[var(--line)] text-[var(--ink)]";
  return <span className={`mono inline-grid size-12 shrink-0 place-items-center font-semibold ${color}`} title={`Compatibilidade: ${value} de 100`}>{value}</span>;
}

function Verification({ job }: { job: Job }) {
  if (job.display_tier === "watchlist") {
    return <span className="eyebrow inline-flex items-center gap-1.5 bg-[#fff0bf] px-2 py-1 text-[10px] text-[var(--ink)]"><span className="size-1.5 animate-pulse rounded-full bg-[var(--amber)]" />Em verificação</span>;
  }
  const value = job.verification_level;
  if (!value || !["confirmed", "probable"].includes(value)) return null;
  const unconfirmedNews = value === "probable" && ["RSS", "Google Alerts"].includes(job.source) && !job.official_url;
  const label = value === "confirmed" ? "Confirmada" : unconfirmedNews ? "Notícia · link não confirmado" : "Provável";
  return <span className={`eyebrow inline-block px-2 py-1 text-[10px] ${value === "confirmed" ? "bg-[var(--green)] text-white" : "bg-[var(--acid)] text-[var(--ink)]"}`}>{label}</span>;
}

export function JobList({ jobs, isDemo, authenticated, savedJobIds }: { jobs: Job[]; isDemo: boolean; authenticated: boolean; savedJobIds: string[] }) {
  const router = useRouter();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [undoJob, setUndoJob] = useState<Job | null>(null);
  const visibleJobs = jobs.filter((job) => !hidden.has(job.id));

  async function decline(job: Job) {
    if (!authenticated) { router.push(`/login?next=${encodeURIComponent(`/?save=${job.id}`)}`); return; }
    setBusy(job.id);
    const response = await fetch(`/api/jobs/${job.id}/decision`, { method: "PUT", headers: { "content-type": "application/json" }, body: "{}" });
    if (response.ok) { setHidden((current) => new Set(current).add(job.id)); setUndoJob(job); router.refresh(); }
    setBusy(null);
  }

  async function undo() {
    if (!undoJob) return;
    setBusy(undoJob.id);
    const response = await fetch(`/api/jobs/${undoJob.id}/decision`, { method: "DELETE" });
    if (response.ok) { setHidden((current) => { const next = new Set(current); next.delete(undoJob.id); return next; }); setUndoJob(null); router.refresh(); }
    setBusy(null);
  }

  if (!visibleJobs.length) {
    return (
      <div className="surface grid min-h-64 place-items-center p-8 text-center">
        <div><BriefcaseBusiness className="mx-auto text-[var(--green)]" size={32} aria-hidden="true" /><h2 className="mt-4 text-xl font-semibold">Nenhuma vaga nesse recorte</h2><p className="mt-2 text-[var(--ink-soft)]">Remova algum filtro ou reduza a pontuação mínima.</p></div>
      </div>
    );
  }

  return (
    <div className="surface overflow-hidden">
      <div className="hidden grid-cols-[minmax(340px,2.4fr)_minmax(150px,1fr)_120px_110px_150px] gap-4 border-b border-[var(--line)] bg-[var(--ink)] px-5 py-3 text-white lg:grid">
        {['Oportunidade', 'Local / modelo', 'Origem', 'Score', 'Meu radar'].map((label) => <span key={label} className="eyebrow text-white/70">{label}</span>)}
      </div>
      <div className="divide-y divide-[var(--line)]">
        {visibleJobs.map((job) => (
          <article key={job.id} className={`group grid gap-3 p-4 transition-colors duration-200 hover:bg-white sm:p-5 lg:grid-cols-[minmax(340px,2.4fr)_minmax(150px,1fr)_120px_110px_150px] lg:items-center ${job.display_tier === "watchlist" ? "border-l-4 border-l-[var(--acid)] bg-[#fffdf4]" : ""}`}>
            <div className="flex min-w-0 gap-3">
              <span className="lg:hidden"><Score value={job.score} /></span>
              <div className="min-w-0">
                <a href={job.application_url || job.official_url || job.source_url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 font-semibold leading-tight underline-offset-4 hover:underline">
                  {job.title}<ArrowUpRight className="shrink-0" size={16} aria-hidden="true" />
                </a>
                <p className="text-sm font-medium text-[var(--green)]">{job.company}</p>
                <div className="mt-2"><Verification job={job} /></div>
                {job.display_tier === "watchlist" && <p className="mt-2 text-xs font-medium text-[var(--amber)]">{(job.display_reasons || []).filter((reason) => reason !== "oportunidade compatível aguardando confirmação").slice(0, 3).join(" · ")}</p>}
                <p className="mt-2 line-clamp-1 max-w-2xl text-sm leading-relaxed text-[var(--ink-soft)]">{job.description}</p>
                <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Motivos da pontuação">
                  {[...job.score_reasons, ...(job.validation_reasons || [])].filter((reason, index, all) => all.indexOf(reason) === index).slice(0, 2).map((reason) => <li key={reason} className="border border-[var(--line)] bg-[var(--paper)] px-2 py-1 text-xs">{reason}</li>)}
                </ul>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm lg:block">
              <MapPin className="shrink-0 text-[var(--green)] lg:mb-2" size={17} aria-hidden="true" />
              <div><p>{job.location || "Não informado"}</p><p className="text-[var(--ink-soft)]">{modeLabel[job.work_mode]}</p></div>
            </div>
            <div className="flex items-center justify-between gap-3 lg:block">
              <span className="eyebrow inline-block bg-[var(--paper)] px-2 py-1 text-[var(--ink-soft)]">{job.source}</span>
              {(job.source_count || 1) > 1 && <span className="mt-1 block text-xs text-[var(--ink-soft)]">Divulgada por {job.source_count} fontes</span>}
              {job.profile_score !== null && job.profile_score !== undefined && <span className="mono mt-1 block text-[10px] text-[var(--green)]">perfil {job.profile_score}</span>}
              <span className="mono text-xs text-[var(--ink-soft)] lg:mt-2 lg:block">{formatDate(job.published_at)}</span>
            </div>
            <div className="hidden lg:block"><Score value={job.score} /></div>
            <div className="grid gap-2">
              <SaveJobButton jobId={job.id} authenticated={authenticated} initiallySaved={savedJobIds.includes(job.id)} disabled={isDemo} />
              {!isDemo && <button type="button" onClick={() => decline(job)} disabled={busy === job.id} className="button-quiet w-full"><span>{busy === job.id ? <LoaderCircle className="animate-spin" size={16} /> : <ArchiveX size={16} />}</span>Dispensar</button>}
            </div>
          </article>
        ))}
      </div>
      {undoJob && <div className="fixed bottom-5 left-1/2 z-[80] flex w-[min(92vw,440px)] -translate-x-1/2 items-center gap-3 border border-white/15 bg-[var(--ink)] p-3 text-white shadow-2xl" role="status" aria-live="polite"><ArchiveX className="shrink-0 text-[var(--acid)]" size={18} /><p className="min-w-0 flex-1 truncate text-sm"><strong>{undoJob.title}</strong> foi dispensada.</p><button type="button" onClick={undo} className="inline-flex min-h-11 items-center gap-2 px-2 font-semibold text-[var(--acid)]"><RotateCcw size={16} />Desfazer</button><button type="button" onClick={() => setUndoJob(null)} className="grid size-11 place-items-center text-white/70" aria-label="Fechar aviso"><X size={17} /></button></div>}
    </div>
  );
}
