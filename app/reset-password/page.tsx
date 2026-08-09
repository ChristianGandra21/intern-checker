import { ShieldCheck } from "lucide-react";
import Link from "next/link";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const valueOf = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function ResetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  return <main className="shell grid min-h-dvh place-items-center py-10"><section className="surface w-full max-w-lg overflow-hidden"><div className="bg-[var(--ink)] p-8 text-white"><ShieldCheck className="text-[var(--acid)]" size={34} /><p className="eyebrow mt-8 text-[var(--acid)]">Nova senha</p><h1 className="mt-2 text-4xl font-semibold tracking-[-.055em]">Proteja seu radar</h1></div><form action="/auth/update-password" method="post" className="grid gap-5 p-8">{valueOf(params.error) && <p className="border-l-4 border-[var(--red)] bg-[#fff0ed] p-3 text-sm text-[var(--red)]">{valueOf(params.error)}</p>}<label><span className="eyebrow">Nova senha</span><input className="field mt-2" name="password" type="password" required minLength={8} autoComplete="new-password" /></label><label><span className="eyebrow">Confirmar senha</span><input className="field mt-2" name="confirmation" type="password" required minLength={8} autoComplete="new-password" /></label><button className="button-dark">Salvar nova senha</button><Link href="/login" className="text-center text-sm font-semibold text-[var(--green)] hover:underline">Voltar ao login</Link></form></section></main>;
}
