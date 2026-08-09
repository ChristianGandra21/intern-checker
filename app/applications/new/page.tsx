import { NewApplicationForm } from "@/components/new-application-form";

export default function NewApplicationPage() {
  return <main id="conteudo" className="shell max-w-5xl pb-20 pt-8"><div className="mb-7 border-b border-[var(--ink)] pb-6"><p className="eyebrow text-[var(--green)]">Cadastro manual</p><h1 className="mt-2 text-4xl font-bold tracking-[-.065em] sm:text-5xl">Nova oportunidade</h1><p className="mt-3 text-[var(--ink-soft)]">Registre uma vaga encontrada fora do radar e acompanhe cada etapa.</p></div><NewApplicationForm /></main>;
}
