"use client";

import { Calculator, Check, LoaderCircle, Save, SlidersHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { calculateDecisionPriorityScore, decisionPriorityCriteria, decisionPriorityLabel, normalizeDecisionPriorityCriteria } from "@/lib/application-priority";
import type { DecisionPriorityCriteria, DecisionPriorityCriterionKey, TrackedApplication } from "@/lib/types";

export function ApplicationPriorityScore({ application }: { application: TrackedApplication }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(Boolean(application.decision_priority_enabled));
  const [criteria, setCriteria] = useState<DecisionPriorityCriteria>(() => normalizeDecisionPriorityCriteria(application.decision_priority_criteria));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const score = calculateDecisionPriorityScore(criteria);

  async function persist(nextEnabled: boolean, nextCriteria: DecisionPriorityCriteria) {
    setBusy(true); setMessage(null);
    const response = await fetch(`/api/applications/${application.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision_priority_enabled: nextEnabled, decision_priority_criteria: nextCriteria }),
    });
    const data = await response.json() as { error?: string };
    if (response.ok) {
      setEnabled(nextEnabled);
      setCriteria(nextEnabled ? nextCriteria : {});
      setMessage(nextEnabled ? "Nota de decisão salva." : "Nota de decisão desativada.");
      router.refresh();
    } else setMessage(data.error || "Não foi possível salvar a nota.");
    setBusy(false);
  }

  function rate(key: DecisionPriorityCriterionKey, value: number | null) {
    setCriteria((current) => {
      const next = { ...current };
      if (value === null) delete next[key];
      else next[key] = value;
      return next;
    });
  }

  if (!enabled) return <section className="surface overflow-hidden"><div className="grid gap-5 p-6 md:grid-cols-[1fr_auto] md:items-center"><div><p className="eyebrow text-[var(--green)]">Decisão opcional</p><h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">Nota de prioridade por critérios</h2><p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--ink-soft)]">Compare esta vaga com as demais usando apenas os critérios que importam para você. A nota não altera o processo nem é compartilhada.</p></div><button type="button" onClick={() => setEnabled(true)} className="button-light"><SlidersHorizontal size={17} />Ativar avaliação</button></div></section>;

  return <section className="surface overflow-hidden">
    <div className="grid gap-5 bg-[var(--ink)] p-6 text-white md:grid-cols-[1fr_180px] md:items-center">
      <div><p className="eyebrow text-[var(--acid)]">Matriz de decisão</p><h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">Prioridade desta oportunidade</h2><p className="mt-2 max-w-2xl text-sm text-white/65">Avalie de 1 a 5. Critérios deixados em branco não entram na média.</p></div>
      <div className="flex items-center gap-4 border border-white/15 bg-white/5 p-4"><span className="mono grid size-16 shrink-0 place-items-center bg-[var(--acid)] text-2xl font-semibold text-[var(--ink)]">{score ?? "—"}</span><span><span className="eyebrow block text-white/50">Nota / 100</span><strong className="mt-1 block text-sm">{score === null ? "Avalie um critério" : decisionPriorityLabel(score)}</strong></span></div>
    </div>
    <div className="grid gap-px bg-[var(--line)] md:grid-cols-2">
      {decisionPriorityCriteria.map((criterion) => {
        const selected = criteria[criterion.key];
        return <fieldset key={criterion.key} className="bg-[var(--surface)] p-5"><legend className="sr-only">{criterion.label}</legend><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{criterion.label}</p><p className="mt-1 text-sm leading-relaxed text-[var(--ink-soft)]">{criterion.description}</p></div>{selected && <button type="button" onClick={() => rate(criterion.key, null)} className="grid size-9 shrink-0 place-items-center text-[var(--ink-soft)] hover:bg-[var(--paper)]" aria-label={`Limpar ${criterion.label}`} title="Não avaliar"><X size={15} /></button>}</div><div className="mt-4 grid grid-cols-5 gap-1" role="radiogroup" aria-label={criterion.label}>{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" role="radio" aria-checked={selected === value} onClick={() => rate(criterion.key, value)} className={`mono min-h-11 border font-semibold transition-colors ${selected === value ? "border-[var(--ink)] bg-[var(--green)] text-white" : "border-[var(--line)] bg-white hover:border-[var(--green)]"}`}>{value}</button>)}</div></fieldset>;
      })}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--ink)] bg-white p-5"><div>{message && <p className={`flex items-center gap-2 text-sm ${/salva|desativada/.test(message) ? "text-[var(--green)]" : "text-[var(--red)]"}`} role="status">{/salva|desativada/.test(message) && <Check size={16} />}{message}</p>}</div><div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => persist(false, {})} className="button-quiet"><X size={17} />Desativar nota</button><button type="button" disabled={busy || score === null} onClick={() => persist(true, criteria)} className="button-dark">{busy ? <LoaderCircle className="animate-spin" size={17} /> : score === null ? <Calculator size={17} /> : <Save size={17} />}Salvar nota</button></div></div>
  </section>;
}
