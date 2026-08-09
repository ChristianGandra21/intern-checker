import { ArchiveX } from "lucide-react";
import { DeclinedJobList } from "@/components/declined-job-list";
import { Pagination } from "@/components/pagination";
import { getDeclinedJobs } from "@/lib/declined-data";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export default async function DeclinedPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const pageValue = Array.isArray(raw.page) ? raw.page[0] : raw.page;
  const data = await getDeclinedJobs(Number(pageValue) || 1);
  return <main id="conteudo" className="shell pb-20 pt-8"><header className="mb-7 flex items-end justify-between gap-4 border-b border-[var(--ink)] pb-6"><div><p className="eyebrow text-[var(--green)]">Seu radar, suas regras</p><h1 className="mt-2 text-4xl font-bold tracking-[-.06em] sm:text-5xl">Dispensadas</h1><p className="mt-3 text-[var(--ink-soft)]">{data.total} oportunidades ocultas somente para você.</p></div><ArchiveX className="hidden text-[var(--green)] sm:block" size={42} strokeWidth={1.5} /></header><DeclinedJobList initial={data.jobs} /><Pagination page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} params={{}} basePath="/declined" /></main>;
}
