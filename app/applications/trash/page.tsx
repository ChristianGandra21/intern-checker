import { Trash2 } from "lucide-react";
import { TrashList } from "@/components/trash-list";
import { getApplications } from "@/lib/application-data";

export default async function TrashPage() {
  const applications = await getApplications("trash");
  return <main id="conteudo" className="shell pb-20 pt-8"><header className="mb-7 flex items-end justify-between gap-4 border-b border-[var(--ink)] pb-6"><div><p className="eyebrow text-[var(--green)]">Recuperação por 30 dias</p><h1 className="mt-2 text-4xl font-bold tracking-[-.06em] sm:text-5xl">Lixeira</h1><p className="mt-3 text-[var(--ink-soft)]">{applications.length} acompanhamentos aguardando exclusão.</p></div><Trash2 className="hidden text-[var(--green)] sm:block" size={42} strokeWidth={1.5} /></header><TrashList initial={applications} /></main>;
}
