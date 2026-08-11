"use client";

import { BrainCircuit, Building2, Check, CheckCircle2, FileText, FileUser, KeyRound, LoaderCircle, MessageSquareQuote, RefreshCcw, Send, Sparkles, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ApplicationRecommendation, TrackedApplication } from "@/lib/types";

type Briefing = {
  description: string;
  company_context: string;
  company_culture: string;
  company_reviews: string;
  application_resume_text: string;
  candidate_pitch: string;
};

export function ApplicationAdvice({ application, initial }: { application: TrackedApplication; initial: ApplicationRecommendation | null }) {
  const router = useRouter();
  const [recommendation, setRecommendation] = useState(initial);
  const [briefing, setBriefing] = useState<Briefing>({
    description: application.description || "",
    company_context: application.company_context || "",
    company_culture: application.company_culture || "",
    company_reviews: application.company_reviews || "",
    application_resume_text: application.application_resume_text || "",
    candidate_pitch: application.candidate_pitch || "",
  });
  const [busy, setBusy] = useState(false);
  const [analyzeResume, setAnalyzeResume] = useState(Boolean(initial?.analyzed_resume));
  const [analyzePitch, setAnalyzePitch] = useState(Boolean(initial?.analyzed_pitch));
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const update = (key: keyof Briefing, value: string) => setBriefing((current) => ({ ...current, [key]: value }));

  async function analyze(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null); setMessage(null);
    const response = await fetch(`/api/applications/${application.id}/recommendations`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...briefing, analyze_resume: analyzeResume, analyze_pitch: analyzePitch }),
    });
    const data = await response.json() as { recommendation?: ApplicationRecommendation; error?: string; hint?: string; cached?: boolean };
    if (data.recommendation) {
      setRecommendation(data.recommendation);
      setMessage(data.cached ? "Briefing salvo. O diagnóstico já estava atualizado." : "Briefing salvo e diagnóstico atualizado.");
      router.refresh();
    } else setError([data.error || "Falha na análise.", data.hint].filter(Boolean).join(" "));
    setBusy(false);
  }

  return <section className="surface overflow-hidden">
    <div className="flex flex-wrap items-start justify-between gap-4 bg-[var(--ink)] p-6 text-white"><div><p className="eyebrow text-[var(--acid)]">Assistente consultivo</p><h2 className="mt-2 text-3xl font-semibold tracking-[-.05em]">Preparação da candidatura</h2><p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/60">Monte o contexto, compare seu currículo e teste seu pitch. As sugestões são privadas, revisáveis e nunca são enviadas automaticamente.</p></div><BrainCircuit className="text-[var(--acid)]" size={34} aria-hidden="true" /></div>
    <form onSubmit={analyze}>
      <BriefingSection number="01" icon={Sparkles} title="Oportunidade" description="A fonte principal para comparar requisitos e evidências.">
        <Field label="Descrição completa da vaga" hint="Único campo obrigatório. Salvar e analisar atualiza também a descrição principal desta vaga."><textarea required className="field min-h-56 resize-y leading-relaxed" value={briefing.description} onChange={(event) => update("description", event.target.value)} maxLength={10000} placeholder="Responsabilidades, requisitos, diferenciais e benefícios…" /></Field>
      </BriefingSection>
      <BriefingSection number="02" icon={Building2} title="Empresa e cultura" description="Cole somente o que deseja usar como contexto; opiniões serão tratadas como percepções.">
        <div className="grid gap-4 lg:grid-cols-2"><Field optional label="Informações da empresa" hint="Negócio, produtos, momento, setor e desafios."><textarea className="field min-h-36 resize-y" value={briefing.company_context} onChange={(event) => update("company_context", event.target.value)} maxLength={12000} /></Field><Field optional label="Cultura e valores" hint="Princípios, estilo de trabalho e sinais do processo seletivo."><textarea className="field min-h-36 resize-y" value={briefing.company_culture} onChange={(event) => update("company_culture", event.target.value)} maxLength={8000} /></Field></div>
        <Field optional label="Opiniões e relatos" hint="Cole avaliações ou anotações. O assistente não tratará relatos individuais como fatos."><textarea className="field min-h-32 resize-y" value={briefing.company_reviews} onChange={(event) => update("company_reviews", event.target.value)} maxLength={12000} placeholder="Pontos recorrentes, fontes consultadas e dúvidas que deseja validar…" /></Field>
      </BriefingSection>
      <BriefingSection number="03" icon={FileUser} title="Seus materiais" description="Escolha o que deve entrar neste diagnóstico. Materiais não selecionados podem ser salvos, mas não serão analisados.">
        <div className="grid gap-3 lg:grid-cols-2"><AnalysisToggle checked={analyzeResume} onChange={setAnalyzeResume} icon={FileText} title="Analisar currículo" description="Usa o texto abaixo ou, se estiver vazio, o currículo salvo no perfil." /><AnalysisToggle checked={analyzePitch} onChange={setAnalyzePitch} icon={MessageSquareQuote} title="Analisar pitch" description="Avalia clareza, evidências e conexão com esta oportunidade." /></div>
        <div className="grid gap-4 lg:grid-cols-2"><Field optional label="Currículo para esta vaga" hint={analyzeResume ? "Será analisado; se vazio, usaremos o currículo do perfil." : "Será salvo, mas ficará fora desta análise."}><textarea className={`field min-h-64 resize-y font-mono text-xs leading-relaxed ${analyzeResume ? "border-[var(--green)]" : "opacity-75"}`} value={briefing.application_resume_text} onChange={(event) => update("application_resume_text", event.target.value)} maxLength={30000} placeholder="Deixe vazio para usar o currículo do perfil…" /></Field><Field optional label="Seu pitch" hint={analyzePitch ? "Será avaliado neste diagnóstico." : "Será salvo, mas ficará fora desta análise."}><textarea className={`field min-h-64 resize-y leading-relaxed ${analyzePitch ? "border-[var(--green)]" : "opacity-75"}`} value={briefing.candidate_pitch} onChange={(event) => update("candidate_pitch", event.target.value)} maxLength={6000} placeholder={`Sou estudante de… Em meu projeto… Quero contribuir com ${application.company} porque…`} /></Field></div>
      </BriefingSection>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--ink)] bg-white p-5 sm:px-6"><div aria-live="polite">{error && <p className="max-w-3xl text-sm text-[var(--red)]"><TriangleAlert className="mr-2 inline" size={16} />{error}</p>}{message && <p className="max-w-3xl text-sm text-[var(--green)]"><CheckCircle2 className="mr-2 inline" size={16} />{message}</p>}</div><button disabled={busy || !briefing.description.trim()} className="button-dark">{busy ? <LoaderCircle className="animate-spin" size={18} /> : recommendation ? <RefreshCcw size={18} /> : <Send size={18} />}{busy ? "Analisando" : recommendation ? "Salvar e reanalisar" : "Salvar e analisar"}</button></div>
    </form>
    {!recommendation ? <div className="grid min-h-44 place-items-center border-t border-[var(--line)] bg-[var(--paper)] p-8 text-center"><div><MessageSquareQuote className="mx-auto text-[var(--green)]" size={30} /><p className="mt-3 text-sm text-[var(--ink-soft)]">Preencha o briefing acima para receber o diagnóstico.</p></div></div> : <AdviceResults recommendation={recommendation} />}
  </section>;
}

function BriefingSection({ number, icon: Icon, title, description, children }: { number: string; icon: LucideIcon; title: string; description: string; children: React.ReactNode }) {
  return <fieldset className="grid gap-5 border-t border-[var(--line)] p-5 sm:p-6"><legend className="sr-only">{title}</legend><div className="flex items-start gap-4"><span className="mono grid size-11 shrink-0 place-items-center border border-[var(--ink)] bg-[var(--acid)] font-semibold">{number}</span><span><span className="flex items-center gap-2 text-xl font-semibold"><Icon className="text-[var(--green)]" size={19} />{title}</span><span className="mt-1 block text-sm text-[var(--ink-soft)]">{description}</span></span></div>{children}</fieldset>;
}

function Field({ label, hint, optional = false, children }: { label: string; hint: string; optional?: boolean; children: React.ReactNode }) {
  return <label><span className="eyebrow">{label}{optional && <span className="ml-2 font-normal normal-case tracking-normal text-[var(--ink-soft)]">opcional</span>}</span><span className="mt-1 block text-xs leading-relaxed text-[var(--ink-soft)]">{hint}</span><span className="mt-2 block">{children}</span></label>;
}

function AnalysisToggle({ checked, onChange, icon: Icon, title, description }: { checked: boolean; onChange: (checked: boolean) => void; icon: LucideIcon; title: string; description: string }) {
  return <label className={`group grid cursor-pointer grid-cols-[44px_1fr_28px] items-center gap-3 border p-4 transition-colors ${checked ? "border-[var(--ink)] bg-[#e8f5ef]" : "border-[var(--line)] bg-white hover:border-[var(--green)]"}`}><input type="checkbox" className="sr-only" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span className={`grid size-11 place-items-center ${checked ? "bg-[var(--green)] text-white" : "bg-[var(--paper)] text-[var(--green)]"}`}><Icon size={19} /></span><span><strong className="block text-sm">{title}</strong><span className="mt-1 block text-xs leading-relaxed text-[var(--ink-soft)]">{description}</span></span><span className={`grid size-7 place-items-center border ${checked ? "border-[var(--green)] bg-[var(--green)] text-white" : "border-[var(--line)] text-transparent"}`} aria-hidden="true"><Check size={16} /></span></label>;
}

function AdviceResults({ recommendation }: { recommendation: ApplicationRecommendation }) {
  return <div className="border-t border-[var(--ink)]"><div className="bg-[#e8f5ef] p-6"><p className="eyebrow text-[var(--green)]">Diagnóstico</p><p className="mt-2 max-w-5xl text-lg leading-relaxed">{recommendation.overall_assessment || "Análise concluída. Revise as evidências e próximos passos abaixo."}</p><div className="mt-4 flex flex-wrap gap-2"><span className="eyebrow border border-[var(--green)] bg-white/60 px-2 py-1 text-[9px] text-[var(--green)]">Vaga analisada</span>{recommendation.analyzed_resume && <span className="eyebrow border border-[var(--green)] bg-white/60 px-2 py-1 text-[9px] text-[var(--green)]">Currículo analisado</span>}{recommendation.analyzed_pitch && <span className="eyebrow border border-[var(--green)] bg-white/60 px-2 py-1 text-[9px] text-[var(--green)]">Pitch analisado</span>}</div></div><div className="grid md:grid-cols-2"><Advice title="Pontos fortes" icon={CheckCircle2} values={recommendation.strengths} /><Advice title="Lacunas a validar" icon={TriangleAlert} values={recommendation.gaps} /><Advice title="Empresa e cultura" icon={Building2} values={recommendation.company_culture_assessment || []} />{recommendation.analyzed_pitch && <><Advice title="Pitch: pontos fortes" icon={MessageSquareQuote} values={recommendation.pitch_strengths || []} /><Advice title="Pitch: como melhorar" icon={Send} values={recommendation.pitch_improvements || []} /></>}{recommendation.analyzed_resume && <Advice title="Currículo: o que evidenciar" icon={KeyRound} values={recommendation.resume_suggestions} />}<Advice title="Tópicos para estudar" icon={BrainCircuit} values={recommendation.study_topics} /><Advice title="Perguntas para praticar" icon={BrainCircuit} values={recommendation.interview_questions} /><Advice title="Próximos passos" icon={CheckCircle2} values={recommendation.next_steps} /></div><div className="border-t border-[var(--line)] p-5"><p className="eyebrow text-[var(--green)]">Palavras-chave</p><div className="mt-3 flex flex-wrap gap-2">{recommendation.keywords.map((value) => <span key={value} className="border border-[var(--line)] bg-white px-2 py-1 text-sm">{value}</span>)}</div><p className="mono mt-4 text-[10px] text-[var(--ink-soft)]">{recommendation.model ? `IA · ${recommendation.model}` : "regras locais"} · {new Intl.DateTimeFormat("pt-BR").format(new Date(recommendation.created_at))}</p></div></div>;
}

function Advice({ title, icon: Icon, values }: { title: string; icon: LucideIcon; values: string[] }) {
  return <div className="border-b border-[var(--line)] p-5 md:border-r"><Icon className="text-[var(--green)]" size={19} /><h3 className="mt-3 font-semibold">{title}</h3><ul className="mt-3 space-y-2 text-sm leading-relaxed text-[var(--ink-soft)]">{values.length ? values.map((value) => <li key={value} className="border-l-2 border-[var(--acid)] pl-3">{value}</li>) : <li>Sem evidência suficiente.</li>}</ul></div>;
}
