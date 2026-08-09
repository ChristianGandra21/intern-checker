"use client";

import { ArchiveX, ArrowUpRight, LoaderCircle, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DeclinedJob } from "@/lib/declined-data";

export function DeclinedJobList({ initial }: { initial: DeclinedJob[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  async function restore(id: string) {
    setBusy(id);
    const response = await fetch(`/api/jobs/${id}/decision`, { method: "DELETE" });
    if (response.ok) { setItems((current) => current.filter((item) => item.job.id !== id)); router.refresh(); }
    setBusy(null);
  }
  if (!items.length) return <div className="surface grid min-h-72 place-items-center p-8 text-center"><div><ArchiveX className="mx-auto text-[var(--green)]" size={34} /><h2 className="mt-4 text-2xl font-semibold">Nenhuma vaga dispensada</h2><p className="mt-2 text-[var(--ink-soft)]">As oportunidades que você remover do radar aparecerão aqui.</p></div></div>;
  return <div className="surface divide-y divide-[var(--line)] overflow-hidden">{items.map(({ job, reason, declinedAt }) => <article key={job.id} className="grid gap-4 p-5 transition-colors hover:bg-white lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-center">
    <div className="min-w-0"><p className="eyebrow text-[var(--ink-soft)]">Dispensada em {new Intl.DateTimeFormat("pt-BR").format(new Date(declinedAt))}</p><a href={job.application_url || job.official_url || job.source_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-lg font-semibold hover:underline">{job.title}<ArrowUpRight size={16} /></a><p className="mt-1 font-semibold text-[var(--green)]">{job.company}</p>{reason && <p className="mt-2 text-sm text-[var(--ink-soft)]">{reason}</p>}</div>
    <div className="text-sm text-[var(--ink-soft)]"><p>{job.location || "Localização não informada"}</p><p className="mt-1">{job.source}</p></div>
    <button type="button" onClick={() => restore(job.id)} disabled={busy === job.id} className="button-light">{busy === job.id ? <LoaderCircle className="animate-spin" size={16} /> : <RotateCcw size={16} />}Restaurar no radar</button>
  </article>)}</div>;
}
