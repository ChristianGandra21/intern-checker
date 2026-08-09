import { Search, SlidersHorizontal } from "lucide-react";

export function Filters({ values }: { values: Record<string, string | undefined> }) {
  return (
    <form className="surface grid gap-3 p-4 lg:grid-cols-[minmax(260px,1.7fr)_repeat(2,minmax(150px,.7fr))_auto]" aria-label="Filtros de vagas">
      <input type="hidden" name="tier" value={values.tier || "radar"} />
      <label className="relative block">
        <span className="sr-only">Buscar por vaga ou empresa</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--ink-soft)]" size={18} aria-hidden="true" />
        <input name="q" defaultValue={values.q} placeholder="Vaga, empresa ou tecnologia" className="min-h-12 w-full border border-[var(--line)] bg-white pl-11 pr-4 text-base placeholder:text-[var(--ink-soft)]/80" />
      </label>
      <label>
        <span className="sr-only">Modelo de trabalho</span>
        <select name="mode" defaultValue={values.mode ?? ""} className="min-h-12 w-full cursor-pointer border border-[var(--line)] bg-white px-3 text-base">
          <option value="">Todos os modelos</option>
          <option value="remote">Remoto</option>
          <option value="hybrid">Híbrido</option>
          <option value="onsite">Presencial</option>
        </select>
      </label>
      <label>
        <span className="sr-only">Pontuação mínima</span>
        <select name="score" defaultValue={values.score ?? "0"} className="min-h-12 w-full cursor-pointer border border-[var(--line)] bg-white px-3 text-base">
          <option value="0">Qualquer score</option>
          <option value="60">Score 60+</option>
          <option value="80">Score 80+</option>
          <option value="90">Score 90+</option>
        </select>
      </label>
      <button className="flex min-h-12 cursor-pointer items-center justify-center gap-2 bg-[var(--green)] px-5 font-semibold text-white transition-colors duration-200 hover:bg-[var(--green-dark)]">
        <SlidersHorizontal size={18} aria-hidden="true" /> Filtrar
      </button>
    </form>
  );
}
