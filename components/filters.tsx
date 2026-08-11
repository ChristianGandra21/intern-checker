import { CalendarDays, Search, SlidersHorizontal } from "lucide-react";

export function Filters({ values }: { values: Record<string, string | undefined> }) {
  return (
    <form className="surface grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Filtros de vagas">
      <input type="hidden" name="tier" value={values.tier || "radar"} />
      <label className="relative block">
        <span className="sr-only">Buscar por vaga ou empresa</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--ink-soft)]" size={18} aria-hidden="true" />
        <input name="q" defaultValue={values.q} placeholder="Vaga, empresa ou tecnologia" className="min-h-12 w-full border border-[var(--line)] bg-white pl-11 pr-4 text-base placeholder:text-[var(--ink-soft)]/80" />
      </label>
      <input name="company" defaultValue={values.company} placeholder="Empresa" className="field" aria-label="Filtrar por empresa" />
      <input name="skill" defaultValue={values.skill} placeholder="Competência: Python, SQL…" className="field" aria-label="Filtrar por competência" />
      <label>
        <span className="sr-only">Modelo de trabalho</span>
        <select name="mode" defaultValue={values.mode ?? ""} className="min-h-12 w-full cursor-pointer border border-[var(--line)] bg-white px-3 text-base">
          <option value="">Todos os modelos</option>
          <option value="remote">Remoto</option>
          <option value="hybrid">Híbrido</option>
          <option value="onsite">Presencial</option>
        </select>
      </label>
      <label><span className="sr-only">Novidade</span><select name="novelty" defaultValue={values.novelty ?? ""} className="field"><option value="">Novas e conhecidas</option><option value="new">Somente novas hoje</option><option value="updated">Atualizadas hoje</option></select></label>
      <label><span className="sr-only">Prazo</span><select name="deadline" defaultValue={values.deadline ?? ""} className="field"><option value="">Qualquer prazo</option><option value="open">Prazo informado e aberto</option><option value="7d">Encerra em até 7 dias</option><option value="30d">Encerra em até 30 dias</option></select></label>
      <label className="flex min-h-12 items-center gap-3 border border-[var(--line)] bg-white px-4"><input type="checkbox" name="salary" value="informed" defaultChecked={values.salary === "informed"} /><span className="text-sm font-medium">Bolsa informada</span></label>
      <label>
        <span className="sr-only">Pontuação mínima</span>
        <select name="score" defaultValue={values.score ?? "0"} className="min-h-12 w-full cursor-pointer border border-[var(--line)] bg-white px-3 text-base">
          <option value="0">Qualquer score</option>
          <option value="60">Score 60+</option>
          <option value="80">Score 80+</option>
          <option value="90">Score 90+</option>
        </select>
      </label>
      <label className="relative">
        <span className="eyebrow mb-1.5 flex items-center gap-1.5 text-[var(--ink-soft)]"><CalendarDays size={14} />Incluída desde</span>
        <input name="date_from" type="date" defaultValue={values.date_from} max={values.date_to} className="field" />
      </label>
      <label>
        <span className="eyebrow mb-1.5 block text-[var(--ink-soft)]">Incluída até</span>
        <input name="date_to" type="date" defaultValue={values.date_to} min={values.date_from} className="field" />
      </label>
      <button className="flex min-h-12 cursor-pointer items-center justify-center gap-2 self-end bg-[var(--green)] px-5 font-semibold text-white transition-colors duration-200 hover:bg-[var(--green-dark)] xl:col-start-4">
        <SlidersHorizontal size={18} aria-hidden="true" /> Filtrar
      </button>
    </form>
  );
}
