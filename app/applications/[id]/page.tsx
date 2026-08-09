import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApplicationDetail } from "@/components/application-detail";
import { getApplication } from "@/lib/application-data";

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const application = await getApplication(id);
  if (!application) notFound();
  return <main id="conteudo" className="shell pb-20 pt-8"><Link href="/applications" className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--green)] hover:underline"><ArrowLeft size={16} />Voltar para minhas vagas</Link><div className="mb-7 border-b border-[var(--ink)] pb-6"><p className="eyebrow text-[var(--green)]">{application.company}</p><h1 className="mt-2 max-w-5xl text-4xl font-bold tracking-[-.06em] sm:text-5xl">{application.title}</h1><p className="mt-3 text-[var(--ink-soft)]">{application.location || "Localização não informada"}</p></div><ApplicationDetail initial={application} /></main>;
}
