import type { JobValidationInput } from "./job-validation";

export type EvidenceFit = "confirmed" | "probable" | "unknown" | "incompatible";
export type DisplayTier = "strong" | "watchlist" | "hidden";
export const CLASSIFICATION_VERSION = "radar-v1";

export interface DisplayFacts {
  area_fit: "tech" | "general" | "non_tech" | "ambiguous";
  candidate_kind: "job" | "lead" | "noise";
  is_active: boolean;
  quality_score: number;
  validation_reasons?: string[];
  duplicate_of?: string | null;
}

export interface AiDisplayFacts {
  is_job: boolean;
  is_internship: boolean;
  target_start: EvidenceFit;
  location_fit: EvidenceFit;
  area_fit: DisplayFacts["area_fit"];
  confidence: number;
}

export interface DisplayDecision {
  display_tier: DisplayTier;
  target_fit: EvidenceFit;
  location_fit: EvidenceFit;
  display_reasons: string[];
  classification_version: typeof CLASSIFICATION_VERSION;
}

const plain = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const internshipSignal = (value: string) => /\b(estagio|estagiari[oa]s?|internship|intern|programa (?:de )?estagio|summer intern)\b/.test(plain(value));

export function detectTargetFit(job: JobValidationInput): EvidenceFit {
  const title = plain(job.title);
  const description = plain(job.description || "");
  const full = `${title} ${description}`;
  const explicitOldTitle = /\b20(?:1\d|2[0-6])(?:[.\/-]?\d)?\b/.test(title) && !/\b2027(?:[.\/-]?[12])?\b/.test(title);
  const contextualOld = /\b(?:inicio|comeco|ciclo|turma|semestre|programa (?:de )?estagio|estagio)\b[^.!?]{0,70}\b20(?:1\d|2[0-6])(?:[.\/-]?\d)?\b/.test(description);
  if (explicitOldTitle || (contextualOld && !/\b2027\b/.test(full))) return "incompatible";
  if (/\b(?:2027[.\/-]?1|1[.\/-]2027|primeiro semestre (?:de )?2027)\b/.test(full)
    || /\b(?:janeiro|fevereiro|marco) (?:de )?2027\b/.test(full)) return "confirmed";
  if (/\b2027\b/.test(full)) return "probable";
  return "unknown";
}

export function detectLocationFit(job: JobValidationInput): EvidenceFit {
  if (job.work_mode === "remote") return "confirmed";
  const location = plain(job.location || "");
  const content = plain(`${job.title} ${job.description || ""}`);
  if (/\b(sao paulo|osasco|barueri|abc paulista|campinas|guarulhos|sp,? br)\b/.test(location)
  ) return "confirmed";
  if (/\b(remoto|remote|home office)\b/.test(location)) return "confirmed";
  if (!location || /^(br|brasil|brazil|nao informado|unknown)$/.test(location)) return "unknown";
  const outsideBrazil = /\b(canada|united states|usa|estados unidos|europe|europa|united kingdom|uk|reino unido|mexico|argentina|chile|colombia|india|singapore|australia|germany|alemanha|france|franca|spain|espanha)\b/.test(location);
  const outsideSaoPaulo = /\b(rio de janeiro|rj|minas gerais|mg|bahia|ba|parana|pr|santa catarina|sc|rio grande do sul|rs|pernambuco|pe|ceara|ce|distrito federal|df)\b/.test(location);
  if ((job.work_mode === "onsite" || job.work_mode === "hybrid") && (outsideBrazil || outsideSaoPaulo)) return "incompatible";
  if (/\b(?:local de trabalho|localizacao|modelo remoto|trabalho remoto)[^.!?]{0,50}\b(sao paulo|remoto|remote)\b/.test(content)) return "confirmed";
  return "unknown";
}

export function classifyDisplay(
  job: JobValidationInput,
  facts: DisplayFacts,
  ai: AiDisplayFacts | null = null,
): DisplayDecision {
  let target = detectTargetFit(job);
  let location = detectLocationFit(job);
  let area = facts.area_fit;
  if (ai && ai.confidence >= 65) {
    if (target === "unknown") target = ai.target_start;
    if (location === "unknown") location = ai.location_fit;
    if (area === "ambiguous" && ["tech", "general"].includes(ai.area_fit)) area = ai.area_fit;
  }
  const reasons: string[] = [];
  if (target === "unknown") reasons.push("ano de início não informado");
  if (location === "unknown") reasons.push("localização não confirmada");
  if (!job.official_url && !job.application_url) reasons.push("link oficial pendente");
  if (target === "incompatible") reasons.push("ciclo explicitamente incompatível");
  if (location === "incompatible") reasons.push("localização explicitamente incompatível");

  const content = `${job.title} ${job.description || ""}`;
  const hasInternship = internshipSignal(content) || Boolean(ai?.is_internship);
  const hardHidden = facts.duplicate_of || !facts.is_active || facts.candidate_kind === "noise"
    || !hasInternship || !["tech", "general"].includes(area)
    || target === "incompatible" || location === "incompatible";
  let tier: DisplayTier = "hidden";
  if (!hardHidden) {
    const complete = ["confirmed", "probable"].includes(target) && ["confirmed", "probable"].includes(location);
    const reliable = facts.candidate_kind === "job" ? facts.quality_score >= 55 : facts.quality_score >= 50;
    tier = complete && reliable ? "strong" : "watchlist";
  }
  if (tier === "strong") reasons.push("ciclo e localização compatíveis");
  if (tier === "watchlist") reasons.push("oportunidade compatível aguardando confirmação");
  return {
    display_tier: tier,
    target_fit: target,
    location_fit: location,
    display_reasons: [...new Set(reasons)],
    classification_version: CLASSIFICATION_VERSION,
  };
}
