import { KeyRound } from "lucide-react";
import Link from "next/link";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const valueOf = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function ForgotPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  return <main className="shell grid min-h-dvh place-items-center py-10"><section className="surface w-full max-w-lg overflow-hidden"><div className="bg-[var(--ink)] p-8 text-white"><KeyRound className="text-[var(--acid)]" size={34} /><p className="eyebrow mt-8 text-[var(--acid)]">Recuperação</p><h1 className="mt-2 text-4xl font-semibold tracking-[-.055em]">Redefina sua senha</h1></div><form action="/auth/recover" method="post" className="grid gap-5 p-8"><p className="text-sm leading-relaxed text-[var(--ink-soft)]">Enviaremos um link de recuperação caso exista uma conta para o e-mail informado.</p>{valueOf(params.error) && <p className="border-l-4 border-[var(--red)] bg-[#fff0ed] p-3 text-sm text-[var(--red)]">{valueOf(params.error)}</p>}{valueOf(params.message) && <p className="border-l-4 border-[var(--green)] bg-[#ecf7f1] p-3 text-sm text-[var(--green)]">{valueOf(params.message)}</p>}<label><span className="eyebrow">E-mail</span><input className="field mt-2" name="email" type="email" required autoComplete="email" /></label><button className="button-dark">Enviar link</button><Link href="/login" className="text-center text-sm font-semibold text-[var(--green)] hover:underline">Voltar ao login</Link></form></section></main>;
}
