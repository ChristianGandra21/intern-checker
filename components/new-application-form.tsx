"use client";

import { ArrowLeft, LoaderCircle, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewApplicationForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const response = await fetch("/api/applications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json() as { application?: { id: string }; error?: string };
    if (response.ok && data.application) router.push(`/applications/${data.application.id}`);
    else { setError(data.error || "Não foi possível cadastrar a vaga."); setBusy(false); }
  }
  return <form onSubmit={submit} className="surface overflow-hidden">
    <div className="grid gap-5 p-6 sm:grid-cols-2 sm:p-8">
      <Field label="Título da vaga *"><input className="field" name="title" required maxLength={240} /></Field>
      <Field label="Empresa *"><input className="field" name="company" required maxLength={200} /></Field>
      <Field label="Site da vaga *" wide><input className="field" name="source_url" type="url" required placeholder="https://..." /></Field>
      <Field label="Localização"><input className="field" name="location" placeholder="São Paulo ou remoto" /></Field>
      <Field label="Modalidade"><select className="field" name="work_mode" defaultValue="unknown"><option value="unknown">Não informada</option><option value="remote">Remoto</option><option value="hybrid">Híbrido</option><option value="onsite">Presencial</option></select></Field>
      <Field label="Prazo da inscrição"><input className="field" name="application_deadline" type="datetime-local" /></Field>
      <Field label="Prioridade manual"><select className="field" name="priority" defaultValue="1"><option value="0">Baixa</option><option value="1">Normal</option><option value="2">Alta</option><option value="3">Essencial</option></select></Field>
      <Field label="Descrição" wide><textarea className="field min-h-32 resize-y" name="description" /></Field>
      <Field label="Notas pessoais" wide><textarea className="field min-h-28 resize-y" name="notes" placeholder="Contato, requisitos, lembretes..." /></Field>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] bg-white p-6 sm:px-8"><div>{error && <p className="text-sm text-[var(--red)]" role="alert">{error}</p>}</div><div className="flex gap-2"><Link className="button-light" href="/applications"><ArrowLeft size={17} />Cancelar</Link><button disabled={busy} className="button-dark">{busy ? <LoaderCircle className="animate-spin" size={17} /> : <Plus size={17} />}Criar acompanhamento</button></div></div>
  </form>;
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "sm:col-span-2" : ""}><span className="eyebrow">{label}</span><span className="mt-2 block">{children}</span></label>;
}
