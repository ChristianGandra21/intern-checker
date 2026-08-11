"use client";

import { CheckCircle2, LoaderCircle, Save } from "lucide-react";
import { useState } from "react";
import type { Job } from "@/lib/types";

export function JobReviewForm({ job, ingestionRunId }: { job: Job; ingestionRunId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(null);
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch(`/api/admin/review/${job.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, ingestion_run_id: ingestionRunId }),
    });
    const data = await response.json() as { error?: string };
    setMessage(response.ok ? "Correção salva e adicionada ao dataset de regressão." : data.error || "Falha ao revisar.");
    setBusy(false);
  }
  return <form onSubmit={submit} className="grid gap-3 border-t border-[var(--line)] bg-white p-4 lg:grid-cols-4">
    <input className="field lg:col-span-2" name="title" defaultValue={job.title} aria-label="Título corrigido" />
    <input className="field" name="company" defaultValue={job.company} aria-label="Empresa corrigida" />
    <input className="field" name="location" defaultValue={job.location} placeholder="Localização" aria-label="Localização corrigida" />
    <select className="field" name="display_tier" defaultValue={job.display_tier}><option value="strong">Forte</option><option value="watchlist">Em análise</option><option value="hidden">Oculta</option></select>
    <select className="field" name="candidate_kind" defaultValue={job.candidate_kind}><option value="job">Vaga</option><option value="lead">Lead</option><option value="noise">Ruído</option></select>
    <select className="field" name="target_fit" defaultValue={job.target_fit}><option value="confirmed">Ciclo confirmado</option><option value="probable">Ciclo provável</option><option value="unknown">Ciclo desconhecido</option><option value="incompatible">Ciclo incompatível</option></select>
    <select className="field" name="location_fit" defaultValue={job.location_fit}><option value="confirmed">Local confirmado</option><option value="probable">Local provável</option><option value="unknown">Local desconhecido</option><option value="incompatible">Local incompatível</option></select>
    <textarea className="field min-h-24 lg:col-span-3" name="reason" required placeholder="Por que esta decisão precisa ser corrigida?" />
    <button disabled={busy} className="button-dark self-end">{busy ? <LoaderCircle className="animate-spin" size={17} /> : <Save size={17} />}Salvar revisão</button>
    {message && <p className={`flex items-center gap-2 text-sm lg:col-span-4 ${/^Correção/.test(message) ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{/^Correção/.test(message) && <CheckCircle2 size={16} />}{message}</p>}
  </form>;
}
