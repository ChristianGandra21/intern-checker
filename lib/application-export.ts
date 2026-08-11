import { decisionPriorityCriteria } from "@/lib/application-priority";
import type { ApplicationStage, ApplicationState, ApplicationStatus, StageState, TrackedApplication, WorkMode } from "@/lib/types";

export const applicationExportColumns = [
  "Vaga",
  "Empresa",
  "Situação da candidatura",
  "Status do acompanhamento",
  "Etapa atual",
  "Próxima etapa agendada",
  "Histórico de etapas",
  "Prioridade",
  "Nota de decisão",
  "Critérios de decisão",
  "Localização",
  "Modalidade",
  "Prazo de inscrição",
  "Origem",
  "Link",
  "Motivo da reprovação",
  "Observações",
  "Criada em",
  "Última atualização",
] as const;

const applicationStateLabels: Record<ApplicationState, string> = {
  not_applied: "Não inscrito",
  applied: "Inscrito",
  rejected: "Reprovado",
  accepted: "Aprovado",
};

const statusLabels: Record<ApplicationStatus, string> = {
  saved: "Salva",
  active: "Em andamento",
  offer: "Proposta",
  rejected: "Reprovada",
  withdrawn: "Desistência",
  archived: "Arquivada",
};

const workModeLabels: Record<WorkMode, string> = {
  remote: "Remoto",
  hybrid: "Híbrido",
  onsite: "Presencial",
  unknown: "Não informado",
};

const stageStateLabels: Record<StageState, string> = {
  pending: "pendente",
  current: "atual",
  completed: "concluída",
  skipped: "ignorada",
};

function stageDate(stage: ApplicationStage) {
  return stage.scheduled_at ? ` — ${stage.scheduled_at}` : "";
}

function currentStage(stages: ApplicationStage[]) {
  return stages.find((stage) => stage.state === "current")
    || [...stages].reverse().find((stage) => stage.state === "completed")
    || stages.find((stage) => stage.state === "pending");
}

function nextScheduledStage(stages: ApplicationStage[]) {
  return stages
    .filter((stage) => stage.state !== "completed" && stage.state !== "skipped" && stage.scheduled_at)
    .sort((left, right) => Date.parse(left.scheduled_at || "") - Date.parse(right.scheduled_at || ""))[0];
}

export function applicationExportRows(applications: TrackedApplication[]) {
  return applications.map((application) => {
    const stages = [...(application.application_stages || [])].sort((left, right) => left.position - right.position);
    const current = currentStage(stages);
    const next = nextScheduledStage(stages);

    return {
      "Vaga": application.title,
      "Empresa": application.company,
      "Situação da candidatura": applicationStateLabels[application.application_state],
      "Status do acompanhamento": statusLabels[application.status],
      "Etapa atual": current ? `${current.name} (${stageStateLabels[current.state]})` : "",
      "Próxima etapa agendada": next ? `${next.name} — ${next.scheduled_at}` : "",
      "Histórico de etapas": stages.map((stage) => `${stage.name} (${stageStateLabels[stage.state]})${stageDate(stage)}`).join(" | "),
      "Prioridade": application.priority,
      "Nota de decisão": application.decision_priority_enabled ? application.decision_priority_score ?? "" : "",
      "Critérios de decisão": application.decision_priority_enabled ? decisionPriorityCriteria
        .filter((criterion) => application.decision_priority_criteria?.[criterion.key])
        .map((criterion) => `${criterion.label}: ${application.decision_priority_criteria?.[criterion.key]}/5`).join(" | ") : "",
      "Localização": application.location,
      "Modalidade": workModeLabels[application.work_mode],
      "Prazo de inscrição": application.application_deadline || "",
      "Origem": application.jobs?.source || (application.job_id ? "Radar" : "Cadastro manual"),
      "Link": application.source_url,
      "Motivo da reprovação": application.rejection_reason,
      "Observações": application.notes,
      "Criada em": application.created_at,
      "Última atualização": application.updated_at,
    };
  });
}
