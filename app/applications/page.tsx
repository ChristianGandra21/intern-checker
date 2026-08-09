import { Plus } from "lucide-react";
import Link from "next/link";
import { ApplicationList } from "@/components/application-list";
import { getApplications } from "@/lib/application-data";
import { currentTimestamp } from "@/lib/time";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const valueOf = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function ApplicationsPage({ searchParams }: { searchParams: SearchParams }) {
  const [applications, raw, now] = await Promise.all([getApplications(), searchParams, currentTimestamp()]);
  return <main id="conteudo" className="shell pb-20 pt-8">
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--ink)] pb-6"><div><p className="eyebrow text-[var(--green)]">Área privada</p><h1 className="mt-2 text-4xl font-bold tracking-[-.065em] sm:text-5xl">Minhas vagas</h1><p className="mt-3 text-[var(--ink-soft)]">{applications.length} oportunidades sob acompanhamento.</p></div><Link href="/applications/new" className="button-dark"><Plus size={18} />Adicionar vaga</Link></div>
    <ApplicationList applications={applications} now={now} values={{ q: valueOf(raw.q), applicationState: valueOf(raw.application_state), timing: valueOf(raw.timing) }} />
  </main>;
}
