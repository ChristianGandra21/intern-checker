import type { ApplicationState } from "@/lib/types";

export const applicationStateOptions: Array<{ value: ApplicationState; label: string; shortLabel: string }> = [
  { value: "not_applied", label: "Não me inscrevi", shortLabel: "Não inscrito" },
  { value: "applied", label: "Inscrito", shortLabel: "Inscrito" },
  { value: "rejected", label: "Reprovado", shortLabel: "Reprovado" },
  { value: "accepted", label: "Aprovado", shortLabel: "Aprovado" },
];

export const applicationStateClasses: Record<ApplicationState, string> = {
  not_applied: "border-[var(--line)] bg-[var(--paper)] text-[var(--ink-soft)]",
  applied: "border-[#9bbbd5] bg-[#e5f1fa] text-[var(--blue)]",
  rejected: "border-[#dfa69e] bg-[#f9e5e1] text-[var(--red)]",
  accepted: "border-[var(--green)] bg-[var(--green)] text-white",
};

export function ApplicationStateBadge({ state, long = false }: { state: ApplicationState; long?: boolean }) {
  const option = applicationStateOptions.find((item) => item.value === state) || applicationStateOptions[0];
  return <span className={`eyebrow inline-flex w-fit items-center border px-2.5 py-1.5 text-[10px] ${applicationStateClasses[state]}`}>{long ? option.label : option.shortLabel}</span>;
}
