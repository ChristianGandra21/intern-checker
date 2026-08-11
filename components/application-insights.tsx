import { BarChart3, Building2, Route } from "lucide-react";
import type { TrackedApplication } from "@/lib/types";

function top(values: string[], limit = 4) {
  const counts = new Map<string, number>();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
}

export function ApplicationInsights({ applications }: { applications: TrackedApplication[] }) {
  const companies = top(applications.map((item) => item.company));
  const sources = top(applications.map((item) => item.jobs?.source || (item.job_id ? "Radar" : "Manual")));
  const rejections = top(applications.filter((item) => item.application_state === "rejected").map((item) => item.rejection_reason || "Não informado"));
  return <details className="surface mb-5 overflow-hidden"><summary className="flex cursor-pointer list-none items-center justify-between p-5"><span><span className="eyebrow text-[var(--green)]">Leitura do funil</span><span className="mt-2 block text-xl font-semibold">Empresas, fontes e reprovações</span></span><BarChart3 className="text-[var(--green)]" size={24} /></summary><div className="grid border-t border-[var(--line)] md:grid-cols-3"><Insight icon={Building2} title="Empresas" values={companies} /><Insight icon={Route} title="Fontes" values={sources} /><Insight icon={BarChart3} title="Motivos de reprovação" values={rejections} /></div></details>;
}
function Insight({ icon: Icon, title, values }: { icon: typeof Building2; title: string; values: Array<[string, number]> }) { return <section className="border-b border-[var(--line)] p-5 md:border-b-0 md:border-r"><Icon className="text-[var(--green)]" size={19} /><h3 className="mt-3 font-semibold">{title}</h3><div className="mt-4 space-y-2">{values.length ? values.map(([label, count]) => <div key={label} className="flex items-center justify-between gap-3 text-sm"><span className="truncate text-[var(--ink-soft)]">{label}</span><span className="mono font-semibold">{count}</span></div>) : <p className="text-sm text-[var(--ink-soft)]">Ainda sem dados.</p>}</div></section>; }
