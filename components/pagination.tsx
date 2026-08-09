import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

export function Pagination({ page, pageCount, total, pageSize, params, basePath = "/" }: { page: number; pageCount: number; total: number; pageSize: number; params: Record<string, string | undefined>; basePath?: string }) {
  if (pageCount <= 1) return null;
  const href = (target: number) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => value && value !== "0" && query.set(key, value));
    query.set("page", String(target));
    return `${basePath}?${query.toString()}`;
  };
  const pages = Array.from(new Set([1, page - 2, page - 1, page, page + 1, page + 2, pageCount])).filter((value) => value >= 1 && value <= pageCount).sort((a, b) => a - b);
  return <nav className="mt-5 flex flex-wrap items-center justify-between gap-4 border border-[var(--line)] bg-[var(--surface)] p-3" aria-label="Paginação de vagas">
    <p className="mono text-xs text-[var(--ink-soft)]">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total}</p>
    <div className="flex items-center gap-1">
      <PageLink href={href(Math.max(1, page - 1))} disabled={page === 1} label="Página anterior"><ChevronLeft size={17} /></PageLink>
      {pages.map((value, index) => <span key={value} className="flex items-center gap-1">{index > 0 && value - pages[index - 1] > 1 && <span className="px-1 text-[var(--ink-soft)]">…</span>}<Link href={href(value)} aria-current={value === page ? "page" : undefined} className={`grid size-10 place-items-center border text-sm font-semibold ${value === page ? "border-[var(--ink)] bg-[var(--ink)] text-white" : "border-transparent hover:border-[var(--line)] hover:bg-white"}`}>{value}</Link></span>)}
      <PageLink href={href(Math.min(pageCount, page + 1))} disabled={page === pageCount} label="Próxima página"><ChevronRight size={17} /></PageLink>
    </div>
  </nav>;
}

function PageLink({ href, disabled, label, children }: { href: string; disabled: boolean; label: string; children: React.ReactNode }) {
  return disabled ? <span className="grid size-10 place-items-center opacity-25" aria-disabled="true">{children}</span> : <Link href={href} aria-label={label} className="grid size-10 place-items-center border border-[var(--line)] hover:bg-white">{children}</Link>;
}
