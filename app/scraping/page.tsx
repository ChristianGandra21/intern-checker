import { SearchCheck } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { ScrapingWorkspace } from "@/components/scraping-workspace";
import { isScrapingAdmin, scrapingEnabled } from "@/lib/admin";
import { requireUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { ScrapeRun } from "@/lib/types";

export default async function ScrapingPage() {
  const user = await requireUser().catch(() => null);
  if (!user) redirect("/login?next=/scraping");
  if (!isScrapingAdmin(user)) notFound();
  const result = await getSupabaseAdmin().from("scrape_runs").select("*").order("requested_at", { ascending: false }).limit(20);
  return <main id="conteudo" className="shell pb-20 pt-8"><header className="mb-7 flex items-end justify-between gap-4 border-b border-[var(--ink)] pb-6"><div><p className="eyebrow text-[var(--green)]">Pipeline local</p><h1 className="mt-2 text-4xl font-bold tracking-[-.06em] sm:text-5xl">Coleta sob demanda</h1><p className="mt-3 max-w-2xl text-[var(--ink-soft)]">Inicie a mesma pipeline do coletor sem abrir o terminal.</p></div><SearchCheck className="hidden text-[var(--green)] sm:block" size={42} strokeWidth={1.5} /></header><ScrapingWorkspace initial={(result.data || []) as ScrapeRun[]} enabled={scrapingEnabled()} /></main>;
}
