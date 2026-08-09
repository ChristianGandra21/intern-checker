"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, BrainCircuit, FileText, LoaderCircle, LockKeyhole, Save, ShieldCheck, Sparkles } from "lucide-react";
import type { ProfileMatch, UserProfile, WorkMode } from "@/lib/types";

const emptyProfile: UserProfile = {
  name: "",
  goals: "",
  resume_text: "",
  skills: [],
  desired_roles: [],
  preferred_locations: ["São Paulo", "Brasil"],
  preferred_work_modes: ["remote", "hybrid"],
  target_start: "2027.1",
  dealbreakers: "",
  ai_enabled: false,
  excluded_area_categories: [],
  excluded_area_terms: [],
};

const areaOptions = [
  ["data_ai", "Dados / IA"], ["software", "Software"], ["qa", "QA"],
  ["product_design", "Produto / Design"], ["infra_cloud_security", "Infra / Cloud / Segurança"],
  ["administration", "Administração"], ["international_relations", "Relações Internacionais"],
  ["hr", "RH"], ["health", "Saúde"], ["law", "Direito"], ["chemistry", "Química"],
  ["engineering_nontech", "Engenharias não tecnológicas"], ["marketing_sales", "Marketing / Comercial"],
  ["finance_accounting", "Finanças / Contabilidade"],
] as const;

type Payload = { profile: UserProfile | null; matches: ProfileMatch[]; groqConfigured: boolean };
const splitList = (value: string) => value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);

export function ProfileWorkspace({ databaseConfigured }: { databaseConfigured: boolean }) {
  const [authorized, setAuthorized] = useState(false);
  const [profile, setProfile] = useState<UserProfile>(emptyProfile);
  const [matches, setMatches] = useState<ProfileMatch[]>([]);
  const [groqConfigured, setGroqConfigured] = useState(false);
  const [busy, setBusy] = useState<"loading" | "saving" | "matching" | null>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    const response = await fetch("/api/profile", { cache: "no-store" });
    if (response.status === 401) {
      setAuthorized(false);
      return;
    }
    const data = await response.json() as Payload & { error?: string };
    if (!response.ok) throw new Error(data.error || "Não foi possível carregar o perfil.");
    setAuthorized(true);
    setProfile(data.profile || emptyProfile);
    setMatches(data.matches || []);
    setGroqConfigured(data.groqConfigured);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProfile()
        .catch((reason) => setError(reason instanceof Error ? reason.message : "Falha ao carregar."))
        .finally(() => setBusy(null));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadProfile]);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setBusy("saving"); setError(null); setMessage(null);
    const response = await fetch("/api/profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(profile) });
    const data = await response.json() as { profile?: UserProfile; error?: string };
    if (!response.ok || !data.profile) setError(data.error || "Não foi possível salvar o perfil.");
    else { setProfile(data.profile); setMessage("Perfil salvo. A próxima análise usará estas informações."); }
    setBusy(null);
  }

  async function analyze() {
    setBusy("matching"); setError(null); setMessage(null);
    const response = await fetch("/api/profile/match", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ limit: 30, use_ai: profile.ai_enabled }) });
    const data = await response.json() as { analyzed?: number; usedAi?: boolean; warning?: string | null; error?: string };
    if (!response.ok) setError(data.error || "Não foi possível analisar as vagas.");
    else {
      setMessage(`${data.analyzed ?? 0} vagas analisadas${data.usedAi ? " com Groq" : " por regras"}.${data.warning ? ` Aviso: ${data.warning}` : ""}`);
      await loadProfile();
    }
    setBusy(null);
  }

  function update<K extends keyof UserProfile>(keyName: K, value: UserProfile[K]) {
    setProfile((current) => ({ ...current, [keyName]: value }));
  }

  if (!databaseConfigured) return <Notice title="Banco não configurado" text="Configure o Supabase e execute as migrations 001 e 002 antes de criar o perfil." />;
  if (busy === "loading" && !authorized) return <Notice title="Verificando acesso" text="Abrindo o cofre do seu perfil…" loading />;
  if (!authorized) {
    return <Notice title="Sessão encerrada" text="Entre novamente com seu e-mail e senha para acessar o perfil." />;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <form onSubmit={saveProfile} className="surface overflow-hidden">
        <div className="border-b border-[var(--line)] bg-white p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow text-[var(--green)]">Briefing pessoal</p><h1 className="mt-2 text-4xl font-semibold tracking-[-0.055em]">O que faz uma vaga valer seu tempo?</h1></div><ShieldCheck className="text-[var(--green)]" size={36} /></div>
          <p className="mt-4 max-w-3xl leading-relaxed text-[var(--ink-soft)]">Quanto mais específico, melhor o ranking. Informações ausentes serão tratadas como incerteza — nunca como reprovação automática.</p>
        </div>
        <div className="grid gap-6 p-6 sm:grid-cols-2 sm:p-8">
          <Field label="Como devemos te chamar?"><input className="field" value={profile.name} maxLength={120} onChange={(event) => update("name", event.target.value)} placeholder="Seu nome" /></Field>
          <Field label="Início desejado"><input className="field" value={profile.target_start} maxLength={40} onChange={(event) => update("target_start", event.target.value)} placeholder="2027.1" /></Field>
          <Field label="Objetivos" wide hint="Tipo de problema, setor, aprendizado e trajetória que você busca."><textarea className="field min-h-32 resize-y" value={profile.goals} onChange={(event) => update("goals", event.target.value)} placeholder="Quero trabalhar perto de produto, usando dados para…" /></Field>
          <Field label="Funções desejadas" hint="Separe por vírgula."><ListInput key={profile.desired_roles.join("|")} values={profile.desired_roles} onCommit={(values) => update("desired_roles", values)} placeholder="dados, produto, software" /></Field>
          <Field label="Competências" hint="Técnicas e comportamentais."><ListInput key={profile.skills.join("|")} values={profile.skills} onCommit={(values) => update("skills", values)} placeholder="Python, SQL, liderança" /></Field>
          <Field label="Localizações preferidas"><ListInput key={profile.preferred_locations.join("|")} values={profile.preferred_locations} onCommit={(values) => update("preferred_locations", values)} placeholder="São Paulo, Brasil" /></Field>
          <Field label="Modelo de trabalho"><div className="flex min-h-12 flex-wrap items-center gap-4 border border-[var(--line)] bg-white px-4">{(["remote", "hybrid", "onsite"] as WorkMode[]).map((mode) => <label key={mode} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={profile.preferred_work_modes.includes(mode)} onChange={(event) => update("preferred_work_modes", event.target.checked ? [...profile.preferred_work_modes, mode] : profile.preferred_work_modes.filter((item) => item !== mode))} />{{ remote: "Remoto", hybrid: "Híbrido", onsite: "Presencial", unknown: "" }[mode]}</label>)}</div></Field>
          <Field label="Currículo em texto" wide hint="Você pode colar o conteúdo ou importar um arquivo .txt/.md.">
            <div className="mb-2 flex justify-end"><label className="inline-flex min-h-10 cursor-pointer items-center gap-2 border border-[var(--ink)] px-3 py-2 text-sm font-semibold hover:bg-white"><FileText size={16} />Importar texto<input className="sr-only" type="file" accept=".txt,.md,text/plain,text/markdown" onChange={async (event) => { const file = event.target.files?.[0]; if (file) update("resume_text", (await file.text()).slice(0, 30000)); }} /></label></div>
            <textarea className="field min-h-64 resize-y font-mono text-xs leading-relaxed" value={profile.resume_text} onChange={(event) => update("resume_text", event.target.value)} placeholder="Formação, projetos, experiências, tecnologias…" />
          </Field>
          <Field label="Impedimentos" wide hint="Ex.: mudança de cidade, presencial fora de SP, requisito de formatura antes de 2027."><textarea className="field min-h-24 resize-y" value={profile.dealbreakers} onChange={(event) => update("dealbreakers", event.target.value)} /></Field>
          <Field label="Áreas que não quero ver" wide hint="As vagas continuam no banco, mas somem do dashboard, ranking, arquivos e alertas.">
            <div className="grid gap-2 border border-[var(--line)] bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
              {areaOptions.map(([value, label]) => <label key={value} className="flex min-h-10 cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={profile.excluded_area_categories.includes(value)} onChange={(event) => update("excluded_area_categories", event.target.checked ? [...profile.excluded_area_categories, value] : profile.excluded_area_categories.filter((item) => item !== value))} />{label}</label>)}
            </div>
          </Field>
          <Field label="Termos adicionais para ocultar" wide hint="Separe por vírgula. Acentos e maiúsculas são ignorados."><ListInput key={profile.excluded_area_terms.join("|")} values={profile.excluded_area_terms} onCommit={(values) => update("excluded_area_terms", values)} placeholder="relações governamentais, engenharia de produção" /></Field>
          <div className="sm:col-span-2 border-l-4 border-[var(--blue)] bg-[#edf5fb] p-5">
            <label className="flex cursor-pointer items-start gap-3"><input className="mt-1" type="checkbox" checked={profile.ai_enabled} onChange={(event) => update("ai_enabled", event.target.checked)} /><span><span className="flex items-center gap-2 font-semibold"><BrainCircuit size={18} />Usar Groq na análise de aderência</span><span className="mt-1 block text-sm leading-relaxed text-[var(--ink-soft)]">Ao ativar e clicar em analisar, objetivos, currículo e preferências serão enviados à API da Groq. Desative para usar somente regras locais.</span></span></label>
            {!groqConfigured && profile.ai_enabled && <p className="mt-3 text-sm font-semibold text-[var(--amber)]">GROQ_API ainda não está disponível no servidor.</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] bg-white p-6 sm:px-8"><div aria-live="polite" className={`text-sm ${error ? "text-[var(--red)]" : "text-[var(--green)]"}`}>{error || message}</div><div className="flex gap-2"><button type="submit" className="button-light" disabled={Boolean(busy)}>{busy === "saving" ? <LoaderCircle className="animate-spin" size={17} /> : <Save size={17} />}Salvar perfil</button><button type="button" onClick={analyze} className="button-dark" disabled={Boolean(busy)}>{busy === "matching" ? <LoaderCircle className="animate-spin" size={17} /> : <Sparkles size={17} />}Analisar 30 vagas</button></div></div>
      </form>

      <aside className="surface h-fit overflow-hidden xl:sticky xl:top-6">
        <div className="bg-[var(--ink)] p-6 text-white"><p className="eyebrow text-[var(--acid)]">Ranking pessoal</p><h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">Melhores encaixes</h2><p className="mt-2 text-sm text-white/65">Score geral e aderência pessoal são medidas diferentes.</p></div>
        {!matches.length ? <div className="p-8 text-center text-sm text-[var(--ink-soft)]">Salve o perfil e analise as vagas para montar este ranking.</div> : <div className="divide-y divide-[var(--line)]">{matches.slice(0, 12).map((match) => <MatchCard key={match.job_id} match={match} />)}</div>}
      </aside>
    </div>
  );
}

function Field({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "sm:col-span-2" : ""}><span className="eyebrow">{label}</span>{hint && <span className="mt-1 block text-xs text-[var(--ink-soft)]">{hint}</span>}<span className="mt-2 block">{children}</span></label>;
}

function ListInput({ values, onCommit, placeholder }: { values: string[]; onCommit: (values: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState(values.join(", "));
  return <input className="field" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => onCommit(splitList(draft))} placeholder={placeholder} />;
}

function MatchCard({ match }: { match: ProfileMatch }) {
  const job = match.jobs;
  if (!job) return null;
  return <article className="p-5 transition-colors hover:bg-white"><div className="flex gap-4"><span className={`mono grid size-12 shrink-0 place-items-center font-semibold ${match.final_score >= 80 ? "bg-[var(--green)] text-white" : match.final_score >= 60 ? "bg-[var(--acid)]" : "bg-[var(--line)]"}`}>{match.final_score}</span><div className="min-w-0"><a className="font-semibold leading-tight hover:underline" href={job.source_url} target="_blank" rel="noreferrer">{job.title}<ArrowUpRight className="ml-1 inline" size={14} /></a><p className="mt-1 text-sm text-[var(--green)]">{job.company}</p><p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]">{match.summary}</p>{match.strengths[0] && <p className="mt-2 text-xs text-[var(--green)]">+ {match.strengths[0]}</p>}{match.concerns[0] && <p className="mt-1 text-xs text-[var(--amber)]">! {match.concerns[0]}</p>}<p className="mono mt-3 text-[10px] uppercase text-[var(--ink-soft)]">{match.ai_score === null ? "regras" : `Groq · ${match.model}`} · geral {job.score}</p></div></div></article>;
}

function Notice({ title, text, loading = false }: { title: string; text: string; loading?: boolean }) {
  return <section className="surface mx-auto grid min-h-72 max-w-xl place-items-center p-8 text-center"><div>{loading ? <LoaderCircle className="mx-auto animate-spin text-[var(--green)]" size={34} /> : <LockKeyhole className="mx-auto text-[var(--green)]" size={34} />}<h1 className="mt-5 text-2xl font-semibold">{title}</h1><p className="mt-2 text-[var(--ink-soft)]">{text}</p></div></section>;
}
