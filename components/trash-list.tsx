"use client";

import { ArrowUpRight, LoaderCircle, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { TrackedApplication } from "@/lib/types";

export function TrashList({ initial }: { initial: TrackedApplication[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  async function act(item: TrackedApplication, permanent: boolean) {
    if (permanent && !window.confirm(`Apagar permanentemente “${item.title}” e todas as etapas? Esta ação não pode ser desfeita.`)) return;
    setBusy(item.id);
    const response = await fetch(permanent ? `/api/applications/${item.id}?permanent=true` : `/api/applications/${item.id}/restore`, { method: permanent ? "DELETE" : "POST" });
    if (response.ok) { setItems((current) => current.filter((value) => value.id !== item.id)); router.refresh(); }
    setBusy(null);
  }
  if (!items.length) return <div className="surface grid min-h-72 place-items-center p-8 text-center"><div><Trash2 className="mx-auto text-[var(--green)]" size={34} /><h2 className="mt-4 text-2xl font-semibold">A lixeira está vazia</h2><p className="mt-2 text-[var(--ink-soft)]">Vagas removidas ficam disponíveis para restauração durante 30 dias.</p></div></div>;
  return <div className="surface divide-y divide-[var(--line)] overflow-hidden">{items.map((item) => <article key={item.id} className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"><div><p className="eyebrow text-[var(--red)]">Exclusão definitiva em até 30 dias</p><h2 className="mt-2 text-xl font-semibold">{item.title}</h2><p className="mt-1 font-semibold text-[var(--green)]">{item.company}</p><a className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm text-[var(--ink-soft)] hover:text-[var(--green)]" href={item.source_url} target="_blank" rel="noreferrer">Abrir site original <ArrowUpRight size={15} /></a></div><div className="flex flex-wrap gap-2"><button type="button" disabled={busy === item.id} onClick={() => act(item, false)} className="button-light">{busy === item.id ? <LoaderCircle className="animate-spin" size={16} /> : <RotateCcw size={16} />}Restaurar</button><button type="button" disabled={busy === item.id} onClick={() => act(item, true)} className="button-light border-[var(--red)] text-[var(--red)]"><Trash2 size={16} />Apagar agora</button></div></article>)}</div>;
}
