"use client";

import {
  ArchiveX, BriefcaseBusiness, Download, LogIn, LogOut, Menu,
  Radar, SearchCheck, Trash2, UserRound, X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type ShellUser = { email: string; name: string } | null;

const baseItems = [{ href: "/", label: "Radar", icon: Radar }];
const privateItems = [
  { href: "/applications", label: "Minhas vagas", icon: BriefcaseBusiness },
  { href: "/declined", label: "Dispensadas", icon: ArchiveX },
  { href: "/applications/trash", label: "Lixeira", icon: Trash2 },
  { href: "/profile", label: "Meu perfil", icon: UserRound },
];

export function AppShell({ children, user, admin, demo }: { children: React.ReactNode; user: ShellUser; admin: boolean; demo: boolean }) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setDrawer(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [drawer]);

  const items = [...baseItems, ...(user ? privateItems : []), ...(admin ? [{ href: "/scraping", label: "Coleta", icon: SearchCheck }] : [])];
  const active = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href === "/applications") return pathname.startsWith("/applications") && !pathname.startsWith("/applications/trash");
    return pathname.startsWith(href);
  };

  const sidebar = <>
    <div className="flex min-h-20 items-center gap-3 border-b border-white/12 px-4">
      <Link href="/" onClick={() => setDrawer(false)} className="grid size-11 shrink-0 place-items-center bg-[var(--acid)] text-[var(--ink)]" aria-label="Radar de Estágios"><Radar size={22} strokeWidth={1.8} /></Link>
      <div className="min-w-0"><p className="truncate text-base font-bold text-white">Radar de Estágios</p><p className="eyebrow mt-1 text-[var(--acid)]">workspace pessoal</p></div>
    </div>
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5" aria-label="Navegação principal">
      <p className="eyebrow mb-3 px-3 text-white/40">Explorar</p>
      {items.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setDrawer(false)} aria-current={active(href) ? "page" : undefined} className={`sidebar-link ${active(href) ? "sidebar-link-active" : ""}`}><Icon size={19} aria-hidden="true" /><span>{label}</span></Link>)}
      <a href="/api/export/xlsx" className="sidebar-link" download><Download size={19} /><span>Exportar XLSX</span></a>
    </nav>
    <div className="border-t border-white/12 p-3">
      <div className="mb-3 flex items-center gap-3 px-2 py-2">
        <span className="grid size-9 shrink-0 place-items-center border border-white/20 bg-white/8 text-[var(--acid)]"><UserRound size={17} /></span>
        <div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{user?.name || "Visitante"}</p><p className="truncate text-xs text-white/50">{user?.email || (demo ? "modo demonstração" : "radar público")}</p></div>
      </div>
      {user ? <form action="/auth/signout" method="post"><button className="sidebar-link w-full text-left"><LogOut size={19} /><span>Sair</span></button></form> : <Link href="/login" onClick={() => setDrawer(false)} className="sidebar-link"><LogIn size={19} /><span>Entrar</span></Link>}
    </div>
  </>;

  return <div className="app-frame">
    <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:bg-white focus:p-3">Pular para o conteúdo</a>
    <aside className="app-sidebar hidden lg:flex">{sidebar}</aside>
    <header className="mobile-header lg:hidden"><button type="button" onClick={() => setDrawer(true)} className="grid size-12 place-items-center" aria-label="Abrir menu" aria-expanded={drawer}><Menu size={22} /></button><Link href="/" className="font-bold tracking-[-.03em]">Radar de Estágios</Link><span className={`size-2.5 rounded-full ${demo ? "bg-[var(--amber)]" : "bg-[var(--green)]"}`} title={demo ? "Modo demonstração" : "Pipeline ativo"} /></header>
    {drawer && <div className="fixed inset-0 z-[90] lg:hidden"><button className="absolute inset-0 bg-black/55" onClick={() => setDrawer(false)} aria-label="Fechar menu" /><aside className="relative flex h-dvh w-[min(88vw,320px)] flex-col bg-[var(--ink)] shadow-2xl" role="dialog" aria-modal="true" aria-label="Menu de navegação"><button ref={closeButton} type="button" onClick={() => setDrawer(false)} className="absolute right-2 top-3 z-10 grid size-11 place-items-center text-white" aria-label="Fechar menu"><X size={21} /></button>{sidebar}</aside></div>}
    <div className="app-main">{children}</div>
  </div>;
}
