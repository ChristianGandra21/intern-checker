import type { DecisionPriorityCriteria, DecisionPriorityCriterionKey } from "@/lib/types";

export const decisionPriorityCriteria = [
  { key: "career_alignment", label: "Alinhamento de carreira", description: "Quanto aproxima você do caminho profissional desejado." },
  { key: "learning_growth", label: "Aprendizado e crescimento", description: "Qualidade do aprendizado, mentoria e evolução possível." },
  { key: "work_interest", label: "Interesse no trabalho", description: "Vontade real de realizar as atividades desta vaga." },
  { key: "compensation_benefits", label: "Remuneração e benefícios", description: "Compatibilidade do pacote com suas necessidades atuais." },
  { key: "location_flexibility", label: "Localização e flexibilidade", description: "Impacto da modalidade, deslocamento e horários na rotina." },
  { key: "company_culture", label: "Empresa e cultura", description: "Confiança na empresa, no ambiente e nos valores percebidos." },
] as const satisfies ReadonlyArray<{ key: DecisionPriorityCriterionKey; label: string; description: string }>;

const criterionKeys = new Set<string>(decisionPriorityCriteria.map((criterion) => criterion.key));

export function normalizeDecisionPriorityCriteria(value: unknown): DecisionPriorityCriteria {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: DecisionPriorityCriteria = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!criterionKeys.has(key)) continue;
    const score = Number(raw);
    if (Number.isInteger(score) && score >= 1 && score <= 5) result[key as DecisionPriorityCriterionKey] = score;
  }
  return result;
}

export function calculateDecisionPriorityScore(criteria: DecisionPriorityCriteria) {
  const values = Object.values(criteria).filter((value): value is number => typeof value === "number");
  if (!values.length) return null;
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length / 5 * 100);
}

export function decisionPriorityLabel(score: number) {
  if (score >= 85) return "Prioridade máxima";
  if (score >= 70) return "Alta prioridade";
  if (score >= 50) return "Prioridade moderada";
  return "Baixa prioridade";
}
