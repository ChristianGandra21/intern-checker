import type { ApplicationState, ApplicationStatus, StageState, WorkMode } from "@/lib/types";

export const applicationStatuses = new Set<ApplicationStatus>(["saved", "active", "offer", "rejected", "withdrawn", "archived"]);
export const applicationStates = new Set<ApplicationState>(["not_applied", "applied", "rejected", "accepted"]);
export const stageStates = new Set<StageState>(["pending", "current", "completed", "skipped"]);
export const workModes = new Set<WorkMode>(["remote", "hybrid", "onsite", "unknown"]);

export const defaultStageNames = [
  "Preparação da candidatura",
  "Inscrição enviada",
  "Teste ou desafio",
  "Entrevista com RH",
  "Entrevista técnica ou case",
  "Entrevista com gestor",
  "Proposta",
];

export function cleanText(value: unknown, max = 5000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function optionalDate(value: unknown) {
  if (value === null || value === "" || value === undefined) return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return undefined;
  const zoned = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value) ? `${value}-03:00` : value;
  return new Date(zoned).toISOString();
}

export function validHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

export function defaultStages(applicationId: string) {
  return defaultStageNames.map((name, position) => ({
    application_id: applicationId,
    name,
    position,
    state: position === 0 ? "current" as const : "pending" as const,
    milestone: position === 1 ? "application_submitted" as const : "none" as const,
  }));
}
