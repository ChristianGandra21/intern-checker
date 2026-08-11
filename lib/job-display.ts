import type { JobValidationInput } from "./job-validation";
import { isNewsCandidate, usefulCompany } from "./news-leads";

export type EvidenceFit = "confirmed" | "probable" | "unknown" | "incompatible";
export type DisplayTier = "strong" | "watchlist" | "hidden";
export const CLASSIFICATION_VERSION = "radar-v2-news-leads";

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
const hiringSignal = (value: string) => {
  const normalized = plain(value);
  return /\b(inscricoes? abertas?|candidate-se|candidatura|apply|aplique|hiring|contratando|processo seletivo|vaga de estagio|oportunidade de estagio)\b/.test(normalized)
    || /\b(abre|abrem|lanca|lancam|oferece|oferecem|anuncia|anunciam)\b.{0,55}\b(vagas?|inscricoes?|programa|estagio)\b/.test(normalized);
};
const brazilSignal = (value: string) => /\b(brasil|brazil|br)\b/.test(plain(value));
const saoPauloSignal = (value: string) => /\b(sao paulo|grande sao paulo|abc paulista|osasco|barueri|campinas|guarulhos|jundiai|santo andre|sao bernardo|sao caetano|cotia|jandira|sorocaba|sao jose dos campos|gaviao peixoto|botucatu|taubate|sp,? br|sp - brasil)\b/.test(plain(value));
const foreignSignal = (value: string) => /\b(canada|toronto|vancouver|united states|usa|estados unidos|new york|miami|california|seattle|europe|europa|united kingdom|uk|reino unido|london|londres|mexico|argentina|chile|colombia|india|madras|bangalore|singapore|australia|germany|alemanha|berlin|france|franca|spain|espanha|portugal|ireland|irlanda|netherlands|holanda|poland|polonia|japan|japao|china|israel|dubai|uae)\b/.test(plain(value));
const outsideSaoPauloSignal = (value: string) => /\b(rio de janeiro|rj|minas gerais|belo horizonte|mg|bahia|salvador|ba|parana|curitiba|pr|santa catarina|florianopolis|sc|rio grande do sul|porto alegre|rs|pernambuco|recife|pe|ceara|fortaleza|ce|distrito federal|brasilia|df|goias|goiania)\b/.test(plain(value));

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
  const location = plain(job.location || "");
  const content = plain(`${job.title} ${job.description || ""}`);
  const remote = job.work_mode === "remote" || /\b(remoto|remote|home office)\b/.test(location);
  const unknownLocation = !location || /^(br|brasil|brazil|nao informado|unknown)$/.test(location);
  if (foreignSignal(location) || ((unknownLocation || remote) && foreignSignal(content))) return "incompatible";
  if (remote) {
    if (brazilSignal(location) || /\b(?:remoto|remote|home office)[^.!?]{0,45}\b(?:brasil|brazil)\b/.test(content)) return "confirmed";
    return "unknown";
  }
  if (saoPauloSignal(location)) return "confirmed";
  if (unknownLocation && saoPauloSignal(content)) return "probable";
  if (outsideSaoPauloSignal(location) || foreignSignal(location) || (unknownLocation && outsideSaoPauloSignal(content))) return "incompatible";
  if (unknownLocation) return "unknown";
  if (/\b(?:local de trabalho|localizacao)[^.!?]{0,50}\b(?:sao paulo|osasco|barueri|campinas|guarulhos)\b/.test(content)) return "confirmed";
  return "unknown";
}

export function hasKnownForeignLocation(job: JobValidationInput) {
  const location = plain(job.location || "");
  const content = `${job.title} ${job.description || ""}`;
  const remote = job.work_mode === "remote" || /\b(remoto|remote|home office)\b/.test(location);
  const unknownLocation = !location || /^(br|brasil|brazil|nao informado|unknown)$/.test(location);
  return foreignSignal(location) || ((unknownLocation || remote) && foreignSignal(content));
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
  const identifiableCompany = usefulCompany(job.company);
  const publishedAt = job.published_at ? Date.parse(job.published_at) : Number.NaN;
  const recentLead = Number.isFinite(publishedAt) && publishedAt >= Date.now() - 45 * 24 * 60 * 60 * 1000;
  const qualifiedNewsWithUnknownLocation = isNewsCandidate(job) && location === "unknown";
  const qualifiedLead = facts.candidate_kind !== "lead" || (
    identifiableCompany && hiringSignal(content) && hasInternship && recentLead
    && ["confirmed", "probable"].includes(target)
    && (["confirmed", "probable"].includes(location) || qualifiedNewsWithUnknownLocation)
  );
  if (facts.candidate_kind === "lead" && !qualifiedLead) reasons.push("lead sem todos os sinais mínimos de contratação, empresa, ciclo e Brasil/SP");
  const hardHidden = facts.duplicate_of || !facts.is_active || facts.candidate_kind === "noise"
    || !hasInternship || !["tech", "general"].includes(area)
    || target === "incompatible" || location === "incompatible"
    || (!qualifiedNewsWithUnknownLocation && !["confirmed", "probable"].includes(location)) || !qualifiedLead;
  let tier: DisplayTier = "hidden";
  if (!hardHidden) {
    const complete = ["confirmed", "probable"].includes(target) && ["confirmed", "probable"].includes(location);
    const reliable = facts.candidate_kind === "job" ? facts.quality_score >= 55 : facts.quality_score >= 50;
    tier = facts.candidate_kind === "lead" ? "watchlist" : complete && reliable ? "strong" : "watchlist";
  }
  if (tier === "strong") reasons.push("ciclo e localização compatíveis");
  if (tier === "watchlist" && facts.candidate_kind === "lead" && location === "unknown") reasons.push("notícia qualificada aguardando localização");
  else if (tier === "watchlist") reasons.push("oportunidade compatível aguardando confirmação");
  if (isNewsCandidate(job) && location === "probable" && saoPauloSignal(`${job.title} ${job.description || ""}`)) reasons.push("programa inclui localidade em São Paulo");
  return {
    display_tier: tier,
    target_fit: target,
    location_fit: location,
    display_reasons: [...new Set(reasons)],
    classification_version: CLASSIFICATION_VERSION,
  };
}
