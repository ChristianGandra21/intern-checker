import type { LucideIcon } from "lucide-react";

export function MetricCard({ label, value, note, icon: Icon, accent = false }: { label: string; value: number | null; note: string; icon: LucideIcon; accent?: boolean }) {
  return (
    <article className={`relative min-h-36 overflow-hidden border p-5 ${accent ? "border-[var(--ink)] bg-[var(--ink)] text-white" : "border-[var(--line)] bg-[var(--surface)]"}`}>
      <div className="flex items-start justify-between">
        <p className={`eyebrow ${accent ? "text-[var(--acid)]" : "text-[var(--ink-soft)]"}`}>{label}</p>
        <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
      </div>
      <p className="mono mt-5 text-4xl font-semibold tracking-[-0.07em]">{value === null ? "—" : String(value).padStart(2, "0")}</p>
      <p className={`mt-2 text-sm ${accent ? "text-white/70" : "text-[var(--ink-soft)]"}`}>{note}</p>
      {accent && <span className="absolute -bottom-10 -right-8 size-28 rounded-full border-[20px] border-[var(--acid)]/20" aria-hidden="true" />}
    </article>
  );
}
