import { Activity, BriefcaseBusiness, Download, LogIn, LogOut, Radar, UserRound } from "lucide-react";
import Link from "next/link";
import { getOptionalUser } from "@/lib/auth";

export async function Header({ isDemo }: { isDemo: boolean }) {
  const user = await getOptionalUser();
  const name = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || "Conta";
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[rgb(244_242_235/92%)] backdrop-blur-md">
      <div className="shell flex min-h-20 items-center justify-between gap-4 py-3">
        <Link href="/" className="group flex min-h-12 items-center gap-3 rounded-sm">
          <span className="grid size-11 place-items-center bg-[var(--ink)] text-[var(--acid)] transition-transform duration-200 group-hover:-rotate-6" aria-hidden="true">
            <Radar size={23} strokeWidth={1.8} />
          </span>
          <span>
            <span className="block text-lg font-bold leading-none tracking-[-0.03em]">Radar de Estágios</span>
            <span className="eyebrow mt-1 block text-[var(--ink-soft)]">Dados · IA · ML</span>
          </span>
        </Link>
        <nav className="flex items-center gap-2" aria-label="Navegação principal">
          <span className="hidden items-center gap-2 border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm sm:flex">
            <Activity size={16} aria-hidden="true" />
            <span>{isDemo ? "modo demonstração" : "pipeline ativo"}</span>
            <span className={`size-2 rounded-full ${isDemo ? "bg-[var(--amber)]" : "bg-[var(--green)]"}`} aria-hidden="true" />
          </span>
          {user && <Link href="/applications" className="flex min-h-11 items-center gap-2 border border-[var(--ink)] px-3 text-sm font-semibold transition-colors hover:bg-white"><BriefcaseBusiness size={17} /><span className="hidden lg:inline">Minhas vagas</span></Link>}
          {user && <Link href="/profile" className="flex min-h-11 items-center gap-2 border border-[var(--ink)] px-3 text-sm font-semibold transition-colors hover:bg-white"><UserRound size={17} /><span className="hidden xl:inline">{name}</span></Link>}
          {!user && <Link href="/login" className="flex min-h-11 items-center gap-2 border border-[var(--ink)] px-3 text-sm font-semibold transition-colors hover:bg-white"><LogIn size={17} /><span className="hidden md:inline">Entrar</span></Link>}
          {user && <form action="/auth/signout" method="post"><button className="grid size-11 cursor-pointer place-items-center border border-[var(--line)] bg-[var(--surface)] hover:bg-white" title="Sair"><LogOut size={17} /><span className="sr-only">Sair</span></button></form>}
          <Link href="/api/export/xlsx" prefetch={false} className="flex min-h-11 items-center gap-2 bg-[var(--ink)] px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--green-dark)]">
            <Download size={17} aria-hidden="true" />
            <span className="hidden sm:inline">Exportar XLSX</span>
            <span className="sm:hidden">XLSX</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
