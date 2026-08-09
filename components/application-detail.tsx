"use client";

import { Archive, ArrowDown, ArrowUp, ArrowUpRight, Check, FileText, LoaderCircle, MapPin, Plus, Save, SkipForward, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApplicationStateBadge, applicationStateClasses, applicationStateOptions } from "@/components/application-state-badge";
import { GoogleCalendarLink } from "@/components/google-calendar-link";
import { saoPauloInputValue } from "@/lib/date-time";
import type { ApplicationStage, ApplicationState, StageState, TrackedApplication } from "@/lib/types";

export function ApplicationDetail({ initial }: { initial: TrackedApplication }) {
  const router = useRouter();
  const [application, setApplication] = useState(initial);
  const [description, setDescription] = useState(initial.description);
  const [stages, setStages] = useState([...(initial.application_stages || [])].sort((a, b) => a.position - b.position));
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const completed = stages.filter((stage) => stage.state === "completed").length;
  const progress = stages.length ? Math.round(completed / stages.length * 100) : 0;

  async function patchApplication(payload: Record<string, unknown>) {
    const response = await fetch(`/api/applications/${application.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json() as { application?: TrackedApplication; error?: string };
    if (!response.ok || !data.application) throw new Error(data.error || "Não foi possível atualizar.");
    setApplication((current) => ({ ...current, ...data.application }));
    return data.application;
  }

  async function updateApplication(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("application"); setMessage(null);
    try { await patchApplication(Object.fromEntries(new FormData(event.currentTarget).entries())); setMessage("Processo atualizado."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível atualizar."); }
    setBusy(null); router.refresh();
  }

  async function updateSituation(state: ApplicationState) {
    setBusy("state"); setMessage(null);
    try { await patchApplication({ application_state: state }); setMessage("Situação atualizada."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível atualizar."); }
    setBusy(null); router.refresh();
  }

  async function archive() {
    if (!window.confirm("Arquivar esta vaga? Ela deixará a lista principal, mas não será apagada.")) return;
    setBusy("archive");
    try { await patchApplication({ status: "archived" }); router.push("/applications"); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível arquivar."); setBusy(null); }
  }

  async function moveToTrash() {
    if (!window.confirm("Mover esta vaga para a lixeira? Você poderá restaurá-la durante 30 dias.")) return;
    setBusy("trash"); setMessage(null);
    const response = await fetch(`/api/applications/${application.id}`, { method: "DELETE" });
    const data = await response.json() as { error?: string };
    if (response.ok) { router.push("/applications/trash"); router.refresh(); return; }
    setMessage(data.error || "Não foi possível mover a vaga para a lixeira."); setBusy(null);
  }

  async function updateStage(stage: ApplicationStage, patch: Record<string, unknown>) {
    setBusy(stage.id); setMessage(null);
    const response = await fetch(`/api/applications/${application.id}/stages/${stage.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
    const data = await response.json() as { error?: string };
    if (!response.ok) setMessage(data.error || "Não foi possível atualizar a etapa."); else await reload();
    setBusy(null);
  }

  async function reload() {
    const response = await fetch(`/api/applications/${application.id}`, { cache: "no-store" });
    const data = await response.json() as { application?: TrackedApplication };
    if (data.application) {
      setApplication(data.application);
      setDescription(data.application.description);
      setStages([...(data.application.application_stages || [])].sort((a, b) => a.position - b.position));
    }
  }

  async function addStage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("new");
    const form = event.currentTarget;
    const response = await fetch(`/api/applications/${application.id}/stages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
    const data = await response.json() as { error?: string };
    if (response.ok) { form.reset(); await reload(); } else setMessage(data.error || "Não foi possível adicionar.");
    setBusy(null);
  }

  async function remove(stage: ApplicationStage) {
    if (!window.confirm(`Remover a etapa “${stage.name}”?`)) return;
    setBusy(stage.id);
    const response = await fetch(`/api/applications/${application.id}/stages/${stage.id}`, { method: "DELETE" });
    if (response.ok) await reload();
    setBusy(null);
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= stages.length) return;
    const ordered = [...stages]; [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    setStages(ordered); setBusy("order");
    const response = await fetch(`/api/applications/${application.id}/stages/order`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: ordered.map((stage) => stage.id) }) });
    if (!response.ok) await reload();
    setBusy(null);
  }

  const calendarDetails = `Vaga: ${application.title}\nEmpresa: ${application.company}\n${application.source_url}`;
  return <div className="grid gap-6">
    <section className="surface overflow-hidden">
      <div className="grid gap-5 border-b border-[var(--line)] bg-white p-6 lg:grid-cols-[1fr_320px] lg:items-center">
        <div><p className="eyebrow text-[var(--green)]">Situação da candidatura</p><div className="mt-3 flex flex-wrap gap-2">{applicationStateOptions.map((option) => <button key={option.value} type="button" disabled={busy === "state"} onClick={() => updateSituation(option.value)} aria-pressed={application.application_state === option.value} className={`min-h-11 border px-3 text-sm font-semibold transition-transform hover:-translate-y-0.5 ${application.application_state === option.value ? applicationStateClasses[option.value] : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-soft)]"}`}>{option.label}</button>)}</div></div>
        <div><div className="flex items-end justify-between"><span className="eyebrow text-[var(--ink-soft)]">Progresso das etapas</span><span className="mono text-sm">{completed}/{stages.length}</span></div><div className="mt-3 h-3 overflow-hidden bg-[var(--line)]"><span className="block h-full bg-[var(--green)] transition-[width] duration-500" style={{ width: `${progress}%` }} /></div></div>
      </div>
      <details open className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-6"><span><span className="eyebrow text-[var(--green)]">Sobre a vaga</span><span className="mt-2 block text-2xl font-semibold tracking-[-.04em]">Descrição e contexto</span></span><FileText className="text-[var(--green)]" size={26} /></summary>
        <form onSubmit={updateApplication} className="grid gap-5 border-t border-[var(--line)] p-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,.55fr)]">
          <div className="grid gap-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="Título"><input className="field" name="title" defaultValue={application.title} required /></Field><Field label="Empresa"><input className="field" name="company" defaultValue={application.company} required /></Field></div><Field label="Site da vaga"><input className="field" type="url" name="source_url" defaultValue={application.source_url} required /></Field><Field label="Descrição completa"><textarea className="field min-h-64 resize-y leading-relaxed" name="description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Cole ou escreva aqui a descrição completa da vaga." /></Field></div>
          <div className="grid content-start gap-4 border-l-4 border-[var(--acid)] bg-[var(--paper)] p-5"><Field label="Localização"><input className="field" name="location" defaultValue={application.location} /></Field><Field label="Modalidade"><select className="field" name="work_mode" defaultValue={application.work_mode}><option value="unknown">Não informada</option><option value="remote">Remoto</option><option value="hybrid">Híbrido</option><option value="onsite">Presencial</option></select></Field><a className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-[var(--green)] hover:underline" href={application.source_url} target="_blank" rel="noreferrer"><MapPin size={15} />Abrir site atual <ArrowUpRight size={15} /></a><button disabled={busy === "application"} className="button-dark">{busy === "application" ? <LoaderCircle className="animate-spin" size={17} /> : <Save size={17} />}Salvar dados da vaga</button></div>
        </form>
      </details>
    </section>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="surface overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-4 bg-[var(--ink)] p-6 text-white"><div><p className="eyebrow text-[var(--acid)]">Linha do tempo</p><h2 className="mt-2 text-3xl font-semibold tracking-[-.05em]">Etapas do processo</h2></div><ApplicationStateBadge state={application.application_state} long /></div>
        <div className="divide-y divide-[var(--line)]">{stages.map((stage, index) => <StageEditor key={stage.id} stage={stage} application={application} index={index} count={stages.length} busy={busy === stage.id} onUpdate={updateStage} onRemove={remove} onMove={move} />)}</div>
        <form onSubmit={addStage} className="grid gap-3 border-t border-[var(--ink)] bg-white p-5 sm:grid-cols-[1fr_210px_auto]"><input className="field" name="name" required placeholder="Nome da nova etapa" /><input className="field" name="scheduled_at" type="datetime-local" /><button disabled={busy === "new"} className="button-dark"><Plus size={17} />Adicionar etapa</button></form>
      </section>
      <aside className="surface h-fit overflow-hidden xl:sticky xl:top-24">
        <div className="border-b border-[var(--line)] bg-white p-6"><p className="eyebrow text-[var(--green)]">Controle do processo</p><p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]">Prazos e anotações privadas desta candidatura.</p></div>
        <form onSubmit={updateApplication} className="grid gap-5 p-6">
          <Field label="Prazo da vaga"><input className="field" name="application_deadline" type="datetime-local" defaultValue={saoPauloInputValue(application.application_deadline)} /></Field>
          <GoogleCalendarLink title={`Prazo da candidatura — ${application.company}`} start={application.application_deadline || ""} details={calendarDetails} location={application.location} />
          <Field label="Prioridade"><select className="field" name="priority" defaultValue={String(application.priority)}><option value="0">Baixa</option><option value="1">Normal</option><option value="2">Alta</option><option value="3">Essencial</option></select></Field>
          <Field label="Notas"><textarea className="field min-h-40 resize-y" name="notes" defaultValue={application.notes} /></Field>
          {message && <p className={`text-sm ${/atualizada|atualizado|salva/.test(message) ? "text-[var(--green)]" : "text-[var(--red)]"}`} role="status">{message}</p>}
          <button disabled={busy === "application"} className="button-dark">{busy === "application" ? <LoaderCircle className="animate-spin" size={17} /> : <Save size={17} />}Salvar alterações</button>
          <button type="button" onClick={archive} disabled={busy === "archive"} className="button-light text-[var(--red)]"><Archive size={17} />Arquivar vaga</button>
          <button type="button" onClick={moveToTrash} disabled={busy === "trash"} className="button-quiet text-[var(--red)]"><Trash2 size={17} />Mover para a lixeira</button>
        </form>
      </aside>
    </div>
  </div>;
}

function StageEditor({ stage, application, index, count, busy, onUpdate, onRemove, onMove }: { stage: ApplicationStage; application: TrackedApplication; index: number; count: number; busy: boolean; onUpdate: (stage: ApplicationStage, patch: Record<string, unknown>) => Promise<void>; onRemove: (stage: ApplicationStage) => Promise<void>; onMove: (index: number, direction: -1 | 1) => Promise<void> }) {
  const [name, setName] = useState(stage.name); const [scheduled, setScheduled] = useState(saoPauloInputValue(stage.scheduled_at)); const [notes, setNotes] = useState(stage.notes);
  const stateLabel: Record<StageState, string> = { pending: "Pendente", current: "Atual", completed: "Concluída", skipped: "Ignorada" };
  const details = `Vaga: ${application.title}\nEmpresa: ${application.company}${notes ? `\n\nNotas: ${notes}` : ""}\n\n${application.source_url}`;
  return <article className={`relative grid gap-4 p-5 sm:grid-cols-[44px_1fr] ${stage.state === "current" ? "bg-[#fffbea]" : ""}`}>
    <div className={`mono grid size-11 place-items-center border ${stage.state === "completed" ? "border-[var(--green)] bg-[var(--green)] text-white" : stage.state === "current" ? "border-[var(--ink)] bg-[var(--acid)]" : "border-[var(--line)] bg-white"}`}>{stage.state === "completed" ? <Check size={18} /> : String(index + 1).padStart(2, "0")}</div>
    <div><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="eyebrow text-[var(--ink-soft)]">{stateLabel[stage.state]}</span>{stage.milestone === "application_submitted" && <span className="eyebrow bg-[#e5f1fa] px-2 py-1 text-[9px] text-[var(--blue)]">Marco de inscrição</span>}</div><div className="flex gap-1"><button type="button" disabled={index === 0 || busy} onClick={() => onMove(index, -1)} className="grid size-9 place-items-center border border-[var(--line)] disabled:opacity-25" title="Mover para cima"><ArrowUp size={15} /></button><button type="button" disabled={index === count - 1 || busy} onClick={() => onMove(index, 1)} className="grid size-9 place-items-center border border-[var(--line)] disabled:opacity-25" title="Mover para baixo"><ArrowDown size={15} /></button><button type="button" disabled={busy} onClick={() => onRemove(stage)} className="grid size-9 place-items-center border border-[var(--line)] text-[var(--red)]" title="Remover"><Trash2 size={15} /></button></div></div>
      <input className="mt-2 w-full border-0 bg-transparent p-0 text-lg font-semibold focus:outline-none" value={name} onChange={(event) => setName(event.target.value)} aria-label="Nome da etapa" />
      <div className="mt-3 grid gap-3 md:grid-cols-[220px_1fr]"><input className="field" type="datetime-local" value={scheduled} onChange={(event) => setScheduled(event.target.value)} aria-label="Data prevista" /><input className="field" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notas da etapa" aria-label="Notas da etapa" /></div>
      <div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" disabled={busy} onClick={() => onUpdate(stage, { name, scheduled_at: scheduled || null, notes })} className="button-light"><Save size={15} />Salvar</button>{stage.state !== "current" && stage.state !== "completed" && <button type="button" disabled={busy} onClick={() => onUpdate(stage, { state: "current" })} className="button-light">Definir como atual</button>}{stage.state !== "completed" && <button type="button" disabled={busy} onClick={() => onUpdate(stage, { state: "completed", name, scheduled_at: scheduled || null, notes })} className="button-dark"><Check size={15} />Concluir</button>}{stage.state !== "skipped" && stage.state !== "completed" && <button type="button" disabled={busy} onClick={() => onUpdate(stage, { state: "skipped" })} className="button-light"><SkipForward size={15} />Ignorar</button>}<GoogleCalendarLink title={`${stage.name} — ${application.company}`} start={stage.scheduled_at || ""} details={details} location={application.location} /></div>
    </div>
  </article>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label><span className="eyebrow">{label}</span><span className="mt-2 block">{children}</span></label>; }
