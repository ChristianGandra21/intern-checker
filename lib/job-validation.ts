import { createHash } from "node:crypto";
import { classifyArea, type AreaFit } from "./area-fit";
import { classifyDisplay, detectLocationFit, detectTargetFit, type DisplayTier, type EvidenceFit } from "./job-display";
import { isNewsCandidate } from "./news-leads";

export type CandidateKind = "job" | "lead" | "noise";
export type ValidationStatus = "accepted" | "review" | "rejected";

export interface JobValidationInput {
  id?: string;
  title: string;
  company?: string;
  description?: string;
  location?: string;
  work_mode?: string;
  source: string;
  source_url: string;
  published_at?: string | null;
  application_deadline?: string | null;
  source_type?: string;
  official_url?: string | null;
  application_url?: string | null;
  raw_payload?: Record<string, unknown>;
  external_id?: string | null;
  score?: number;
}

export interface JobValidation {
  candidate_kind: CandidateKind;
  quality_score: number;
  validation_status: ValidationStatus;
  validation_reasons: string[];
  is_active: boolean;
  canonical_key: string;
  identity_key: string | null;
  last_checked_at: string | null;
  area_fit: AreaFit;
  area_reasons: string[];
  match_area: boolean;
  primary_area: string;
  area_tags: string[];
  display_tier: DisplayTier;
  target_fit: EvidenceFit;
  location_fit: EvidenceFit;
  display_reasons: string[];
  classification_version: string;
}

const INTERNSHIP = /\b(est[aá]gio|estagi[aá]ri[oa]s?|internship|intern|programa de est[aá]gio|summer intern)\b/i;
const CLOSED = /\b(vaga encerrada|inscri[cç][oõ]es encerradas?|processo seletivo encerrado|n[aã]o est[aá] mais aceitando|job (?:is )?closed|position (?:has been )?filled|no longer accepting)\b/i;
const NON_JOB_TITLE = /\b(concurso|vestibular|fies|curso(?:s)? gratuito|professor(?:a|es)?|licita[cç][aã]o|pr[eê]mio|nomea[cç][aã]o|jovem aprendiz|aprendizagem)\b/i;
const SENIOR_TITLE = /\b(s[eê]nior|senior|staff|principal|lead)\b/i;
const TRAINEE_TITLE = /\btrainee\b/i;
const APPLICATION_SIGNAL = /\b(inscri[cç][oõ]es abertas?|candidate-se|candidatura|apply|aplicar|processo seletivo|vaga de est[aá]gio|oportunidade de est[aá]gio)\b|\b(?:abre|abrem|lan[cç]a|lan[cç]am|oferece|oferecem|anuncia|anunciam)\b.{0,55}\b(?:vagas?|inscri[cç][oõ]es?|programa|est[aá]gio)\b/i;
const GENERIC_TITLE = /^(vagas?|carreiras?|oportunidades?|saiba mais|acesse|clique aqui|ver vagas?|est[aá]gio|home|in[ií]cio|s[aã]o paulo|brasil|home office(?: \(\d+\))?)$/i;
const LISTING_TITLE = /^\s*(?:\d[\d.,]*\s+vagas?(?:\b|\()|vagas? (?:de|para)\b)|search thousands of jobs|avalia[cç][oõ]es da empresa|empresas que contratam|lista de empresas/i;
const SEEKER_OR_ARTICLE = /#?opentowork|\b(?:estou|i am) (?:procurando|looking for)\b|\bbusco (?:uma )?(?:vaga|est[aá]gio)\b|\b(?:meu amigo|minha amiga).{0,40}\b(?:procura|busca)\b|\bcomo (?:conseguir|encontrar|se preparar)\b|\bdicas? (?:para|de)\b|\bguia (?:de|para)\b|\brecrutador(?:a|es)?\b/i;
const LEAD_SOURCES = new Set(["RSS", "Mastodon", "X", "Bluesky", "Reddit", "Hacker News", "Forums", "Communities", "Telegram", "Google Alerts"]);
const TRUSTED_JOB_SOURCES = new Set([
  "LinkedIn", "Gupy", "Vagas.com", "Indeed", "Infojobs", "Catho", "Solides", "CIEE", "Nube",
  "99jobs", "Cia de Estágios", "Cia de Talentos", "Super Estágios", "Estagiarios.com",
  "Estágio Trainee", "Futura Estágios", "WallJobs", "Eureca", "IEL", "ABRE", "Na Prática",
  "Universia", "Empregare", "Across", "Seja Trainee", "O Trainee", "Lever", "Greenhouse",
  "Ashby", "Workday", "Careers", "Planilha comunitária",
]);
const LISTING_PATHS = [/\/job-search\/?/i, /\/jobs?\/?$/i, /\/vagas\/?$/i, /\/carreiras\/?$/i, /\/careers\/?$/i, /\/estudantes\/?$/i, /\/empregos\.aspx$/i, /\/search\/?$/i, /\/lista-de-vagas/i];

const plain = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
const unique = (values: string[]) => [...new Set(values)];

function normalizedUrl(value: string) {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|ref$|refid$|trk$|jobboardsource$)/i.test(key)) url.searchParams.delete(key);
    }
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/$/, "");
    return url.toString();
  } catch {
    return value;
  }
}

function identityTitle(value: string) {
  return plain(value)
    .replace(/^pagina da vaga\s*[|:-]\s*/i, "")
    .replace(/\s+[-–—|]\s+(linkedin brasil|linkedin|indeed|glassdoor|vagas\.com|[^ ]+\.com\.br)$/i, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalJobKey(job: JobValidationInput) {
  const bestUrl = job.application_url || job.official_url || job.source_url;
  return createHash("sha256").update(`url:${normalizedUrl(bestUrl)}`).digest("hex");
}

export function identityJobKey(job: JobValidationInput) {
  const company = plain(job.company || "");
  const title = identityTitle(job.title);
  const usefulCompany = company && company !== "nao informada" && !company.startsWith("google news");
  if (!usefulCompany || title.length < 8) return null;
  const isGeneralProgram = /\b(programa (?:de )?estagio|internship program|summer internship)\b/.test(title);
  const location = isGeneralProgram ? "" : plain(job.location || "");
  return createHash("sha256").update(`identity:${title}|${company}|${location}`).digest("hex");
}

function isListingUrl(value: string) {
  try {
    const url = new URL(value);
    return LISTING_PATHS.some((pattern) => pattern.test(url.pathname))
      || [...url.searchParams.keys()].some((key) => /^(q|query|keyword|location|localidade|page|pagina|filter|filtro)$/i.test(key))
      || /(?:indeed|glassdoor)\./i.test(url.hostname) && !/\/(?:viewjob|job-listing)\//i.test(url.pathname);
  } catch {
    return true;
  }
}

function hasIndividualEvidence(job: JobValidationInput) {
  if (job.official_url || job.application_url || job.external_id || job.raw_payload?.external_id) return true;
  try {
    const url = new URL(job.source_url);
    return /\/(?:jobs?|vagas?|positions?|opportunities)\/(?:view\/)?[a-z0-9][a-z0-9_-]{4,}|\/jobdetail\/|\/vaga-de-|\/vacancy\//i.test(url.pathname)
      || /\b(jobid|job_id|job|vaga|vacancy)=\w{4,}/i.test(url.search);
  } catch { return false; }
}

function isOfficialProgramPage(job: JobValidationInput, text: string) {
  return !isNewsCandidate(job)
    && INTERNSHIP.test(job.title)
    && APPLICATION_SIGNAL.test(text)
    && Boolean(job.official_url || job.application_url || job.source_type === "official");
}

export function validateJob(job: JobValidationInput): JobValidation {
  const title = job.title.trim();
  const text = `${title} ${job.description || ""}`;
  const reasons: string[] = [];
  let quality = 35;
  let kind: CandidateKind = job.source_type === "official" ? "job" : LEAD_SOURCES.has(job.source) ? "lead" : "job";
  let active = true;
  let hardReject = false;
  const hasOfficial = Boolean(job.official_url || job.application_url);
  const isNews = isNewsCandidate(job);
  const rowPayload = job.raw_payload?.row;
  const structuredArea = rowPayload && typeof rowPayload === "object" && "area" in rowPayload
    ? String((rowPayload as Record<string, unknown>).area || "")
    : "";
  let area = classifyArea(`${structuredArea} ${title}`, job.description || "");
  const targetFit = detectTargetFit(job);
  const locationFit = detectLocationFit(job);
  if (isNews && area.area_fit === "ambiguous" && INTERNSHIP.test(title) && APPLICATION_SIGNAL.test(text) && targetFit !== "incompatible") {
    area = { area_fit: "general", area_reasons: ["notícia sobre programa geral de estágio"], primary_area: "general", area_tags: ["general"] };
  }

  if (job.raw_payload?._prefiltered === true) {
    quality = 0; kind = "noise"; hardReject = true; reasons.push("descartada pelo pré-filtro antes do enriquecimento");
  }

  if (area.area_fit === "tech") { quality += 15; reasons.push(...area.area_reasons); }
  else if (area.area_fit === "general") { quality += 5; reasons.push(...area.area_reasons); }
  else if (area.area_fit === "non_tech") {
    quality -= 70; hardReject = true; reasons.push(...area.area_reasons);
  } else { quality -= 10; reasons.push(...area.area_reasons); }

  if (INTERNSHIP.test(title)) { quality += 30; reasons.push("estágio confirmado no título"); }
  else if (INTERNSHIP.test(text)) { quality += 20; reasons.push("estágio mencionado no conteúdo"); }
  else { quality -= 45; reasons.push("não há evidência de vaga de estágio"); }

  const targetConfirmed = ["confirmed", "probable"].includes(targetFit);
  if (targetConfirmed) { quality += 15; reasons.push("referência ao ciclo de 2027"); }
  else { quality -= 10; reasons.push("início em 2027 não confirmado"); }
  if (targetFit === "incompatible") { quality -= 35; hardReject = true; reasons.push("ciclo explicitamente incompatível"); }

  const locationConfirmed = ["confirmed", "probable"].includes(locationFit);
  if (locationConfirmed) { quality += 12; reasons.push("São Paulo ou remoto confirmado"); }
  else { quality -= 10; reasons.push("São Paulo ou remoto não confirmado"); }
  if (locationFit === "incompatible") { quality -= 35; hardReject = true; reasons.push("localização explicitamente incompatível"); }

  if (TRUSTED_JOB_SOURCES.has(job.source)) { quality += 12; reasons.push("fonte de vagas reconhecida"); }
  if (LEAD_SOURCES.has(job.source) && !hasOfficial) { quality -= 25; reasons.push("fonte indireta: link oficial não confirmado"); }
  if (LEAD_SOURCES.has(job.source) && hasOfficial) { quality += 5; reasons.push("fonte indireta ligada a uma candidatura"); }
  if (APPLICATION_SIGNAL.test(text)) { quality += 8; reasons.push("há sinal de candidatura"); }

  const officialProgram = isOfficialProgramPage(job, text);
  if (GENERIC_TITLE.test(title) || LISTING_TITLE.test(title) || SEEKER_OR_ARTICLE.test(text) || (isListingUrl(job.source_url) && !officialProgram)) {
    quality -= 45; kind = "noise"; hardReject = true; reasons.push("página genérica, não uma vaga individual");
  }
  if (kind === "job" && !hasIndividualEvidence(job) && !officialProgram) {
    quality -= 30; kind = "noise"; hardReject = true; reasons.push("URL sem evidência de vaga individual");
  }
  if (title.length > 220) { quality -= 25; reasons.push("título contém texto de post ou página inteira"); }
  const mixedInternshipProgram = INTERNSHIP.test(text) && TRAINEE_TITLE.test(title);
  if (NON_JOB_TITLE.test(title) || SENIOR_TITLE.test(title) || (TRAINEE_TITLE.test(title) && !mixedInternshipProgram)) {
    quality -= 55; hardReject = true; reasons.push("título incompatível com estágio");
  }
  if (CLOSED.test(text)) { quality -= 60; active = false; hardReject = true; reasons.push("vaga ou inscrições encerradas"); }
  if (job.published_at) {
    const age = Date.now() - new Date(job.published_at).getTime();
    if (isNews && !job.application_deadline && Number.isFinite(age) && age > 1000 * 60 * 60 * 24 * 120) {
      quality -= 45; active = false; reasons.push("notícia sem prazo publicada há mais de 120 dias");
    }
    if (Number.isFinite(age) && age > 1000 * 60 * 60 * 24 * 540) {
      quality -= 45; active = false; reasons.push("publicação com mais de 18 meses");
    }
  }
  if (job.application_deadline) {
    const deadline = new Date(job.application_deadline).getTime();
    if (Number.isFinite(deadline) && deadline < Date.now()) {
      quality -= 60; active = false; hardReject = true; reasons.push("prazo de candidatura expirado");
    }
  }
  const httpStatus = Number(job.raw_payload?.official_http_status ?? job.raw_payload?.http_status);
  if ([404, 410].includes(httpStatus)) {
    quality -= 60; active = false; hardReject = true; reasons.push(`link indisponível (${httpStatus})`);
  }

  quality = Math.max(0, Math.min(100, quality));
  if (kind === "lead" && quality < 20) kind = "noise";
  const status: ValidationStatus = hardReject || !active || quality < 30
    ? "rejected"
    : kind === "job" && ["tech", "general"].includes(area.area_fit) && targetConfirmed && locationConfirmed && quality >= 60
      ? "accepted"
      : "review";
  const base = {
    candidate_kind: kind,
    quality_score: quality,
    validation_status: status,
    validation_reasons: unique(reasons),
    is_active: active,
    canonical_key: canonicalJobKey(job),
    identity_key: identityJobKey(job),
    last_checked_at: null,
    area_fit: area.area_fit,
    area_reasons: area.area_reasons,
    match_area: area.area_fit === "tech",
    primary_area: area.primary_area,
    area_tags: area.area_tags,
  };
  return { ...base, ...classifyDisplay(job, base) };
}

export async function checkJobUrl(job: JobValidationInput, current: JobValidation): Promise<JobValidation> {
  if (current.validation_status === "rejected" || current.candidate_kind !== "job") return current;
  const checked = { ...current, validation_reasons: [...current.validation_reasons], last_checked_at: new Date().toISOString() };
  try {
    const response = await fetch(job.source_url, {
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (compatible; InternshipRadar/1.0; link-validation)" },
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status === 404 || response.status === 410) {
      checked.is_active = false;
      checked.validation_status = "rejected";
      checked.quality_score = Math.max(0, checked.quality_score - 60);
      checked.validation_reasons = unique([...checked.validation_reasons, `link indisponível (${response.status})`]);
      return checked;
    }
    if (!response.ok) {
      checked.validation_reasons = unique([...checked.validation_reasons, `link não pôde ser confirmado (${response.status})`]);
      return checked;
    }
    const body = (await response.text()).slice(0, 250_000);
    if (CLOSED.test(body)) {
      checked.is_active = false;
      checked.validation_status = "rejected";
      checked.quality_score = Math.max(0, checked.quality_score - 60);
      checked.validation_reasons = unique([...checked.validation_reasons, "página informa que a vaga foi encerrada"]);
    } else {
      checked.quality_score = Math.min(100, checked.quality_score + 5);
      checked.validation_reasons = unique([...checked.validation_reasons, "link verificado"]);
    }
  } catch {
    checked.validation_reasons = unique([...checked.validation_reasons, "link não respondeu; mantido sem rejeição automática"]);
  }
  return checked;
}
