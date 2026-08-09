import { LockKeyhole, Radar, UserPlus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getOptionalUser } from "@/lib/auth";
import { hasAuthConfig } from "@/lib/supabase/server";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const valueOf = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const nextValue = valueOf(params.next) || "/applications";
  const next = nextValue.startsWith("/") && !nextValue.startsWith("//") ? nextValue : "/applications";
  const signup = valueOf(params.mode) === "signup";
  const user = await getOptionalUser();
  if (user) redirect(next);
  const configured = hasAuthConfig();
  return <main className="shell grid min-h-dvh place-items-center py-10">
    <section className="grid w-full max-w-4xl overflow-hidden border border-[var(--ink)] bg-[var(--surface)] shadow-[var(--shadow)] md:grid-cols-[1.05fr_.95fr]">
      <div className="relative overflow-hidden bg-[var(--ink)] p-8 text-white sm:p-12">
        <Radar className="text-[var(--acid)]" size={42} />
        <p className="eyebrow mt-16 text-[var(--acid)]">Área pessoal</p>
        <h1 className="mt-3 text-5xl font-bold leading-[.92] tracking-[-.065em]">Seu processo,<br />sob controle.</h1>
        <p className="mt-6 max-w-sm leading-relaxed text-white/65">Salve oportunidades, acompanhe entrevistas e mantenha cada prazo em uma linha do tempo privada.</p>
        <span className="absolute -bottom-24 -right-20 size-64 rounded-full border-[42px] border-[var(--acid)]/15" />
      </div>
      <div className="flex flex-col justify-center p-8 sm:p-12">
        <p className="eyebrow text-[var(--green)]">{signup ? "Nova conta" : "Entrar no radar"}</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-.05em]">{signup ? "Crie seu acesso" : "Bem-vindo de volta"}</h2>
        <p className="mt-3 text-sm leading-relaxed text-[var(--ink-soft)]">Use seu e-mail e senha. A sessão continuará ativa neste navegador até você sair.</p>
        {valueOf(params.error) && <p className="mt-5 border-l-4 border-[var(--red)] bg-[#fff0ed] p-3 text-sm text-[var(--red)]" role="alert">{valueOf(params.error)}</p>}
        {valueOf(params.message) && <p className="mt-5 border-l-4 border-[var(--green)] bg-[#ecf7f1] p-3 text-sm text-[var(--green)]" role="status">{valueOf(params.message)}</p>}
        {configured ? <form action="/auth/password" method="post" className="mt-7 grid gap-4">
          <input type="hidden" name="mode" value={signup ? "signup" : "login"} /><input type="hidden" name="next" value={next} />
          <label><span className="eyebrow">E-mail</span><input className="field mt-2" name="email" type="email" required autoComplete="email" placeholder="voce@email.com" /></label>
          <label><span className="eyebrow">Senha</span><input className="field mt-2" name="password" type="password" required minLength={8} autoComplete={signup ? "new-password" : "current-password"} placeholder="Mínimo de 8 caracteres" /></label>
          <button className="button-dark min-h-14 text-base">{signup ? <UserPlus size={18} /> : <LockKeyhole size={18} />}{signup ? "Criar conta" : "Entrar"}</button>
        </form> : <p className="mt-8 border border-[var(--amber)] bg-[#fff4df] p-4 text-sm">Configure as variáveis públicas do Supabase para habilitar o login.</p>}
        <div className="mt-5 flex flex-wrap justify-between gap-3 text-sm"><Link href={`/login?mode=${signup ? "login" : "signup"}&next=${encodeURIComponent(next)}`} className="font-semibold text-[var(--green)] hover:underline">{signup ? "Já tenho uma conta" : "Criar uma conta"}</Link>{!signup && <Link href="/forgot-password" className="text-[var(--ink-soft)] hover:underline">Esqueci minha senha</Link>}</div>
        <Link href="/" className="mt-6 text-center text-sm font-semibold text-[var(--green)] hover:underline">Voltar ao radar público</Link>
      </div>
    </section>
  </main>;
}
