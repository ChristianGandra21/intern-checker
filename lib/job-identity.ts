import { createHash } from "node:crypto";
import rules from "@/config/dedup-rules.json";

export interface IdentityInput {
  title: string; company?: string; description?: string; location?: string; source_url: string;
  official_url?: string | null; application_url?: string | null; external_id?: string | null;
}
export interface DedupIdentity {
  key: string; confidence: number; reasons: string[]; cycle: string | null; tokens: string[];
  company: string; location: string; program: boolean;
}

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const identityPlain = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
const normalizedUrl = (value: string) => {
  try {
    const url = new URL(value);
    [...url.searchParams.keys()].forEach((key) => /^(utm_|ref$|refid$|trk$|jobboardsource$|source$)/i.test(key) && url.searchParams.delete(key));
    url.hash = ""; url.pathname = url.pathname.replace(/\/$/, "");
    return url.toString();
  } catch { return value; }
};
export const extractCycle = (text: string) => identityPlain(text).match(/\b20\d{2}(?:[ .\/-]?[12])?\b/)?.[0].replace(/[ .\/-]/g, ".") || null;
const usefulCompany = (value: string) => {
  const normalized = identityPlain(value);
  return normalized && !["nao informada", "rss", "google news"].some((term) => normalized.includes(term)) ? normalized : "";
};
const isProgram = (text: string) => rules.program_signals.some((term) => identityPlain(text).includes(term));
export const identityTokens = (value: string) => {
  const ignored = new Set(rules.generic_terms);
  return [...new Set(identityPlain(value).split(" ").filter((token) => token.length > 1 && !ignored.has(token)))].sort();
};

export function buildDedupIdentity(job: IdentityInput): DedupIdentity {
  const bestUrl = job.application_url || job.official_url;
  const cycle = extractCycle(`${job.title} ${job.description || ""}`);
  const company = usefulCompany(job.company || "");
  const location = identityPlain(job.location || "");
  const program = isProgram(job.title);
  const titleWithoutPublisher = job.title.split(/\s(?:[-–—|])\s/)[0];
  const tokens = identityTokens(`${company} ${titleWithoutPublisher}`);
  if (job.external_id && bestUrl) {
    let host = "unknown";
    try { host = new URL(bestUrl).hostname; } catch { /* URL inválida cai na identidade textual de segurança. */ }
    return { key: digest(`external:${host}:${job.external_id}`), confidence: 100, reasons: ["mesmo identificador externo"], cycle, tokens, company, location, program };
  }
  if (bestUrl) return { key: digest(`official:${normalizedUrl(bestUrl)}`), confidence: 98, reasons: ["mesma URL oficial"], cycle, tokens, company, location, program };
  if (program && tokens.length) {
    return { key: digest(`program:${cycle || "unknown"}:${tokens.join("|")}`), confidence: company ? 92 : 82, reasons: ["mesmo programa, organização e ciclo"], cycle, tokens, company, location, program };
  }
  const title = identityPlain(job.title).replace(/\b(estagio|estagiario|estagiaria|intern)\b/g, "").trim();
  return { key: digest(`role:${company || "unknown"}:${title}:${location}:${cycle || "unknown"}`), confidence: company ? 88 : 60, reasons: ["mesma empresa, cargo, local e ciclo"], cycle, tokens: identityTokens(`${company} ${title}`), company, location, program };
}

const overlap = (a: string[], b: string[]) => {
  const left = new Set(a); const right = new Set(b);
  const shared = [...left].filter((token) => right.has(token)).length;
  return shared / Math.max(1, Math.min(left.size, right.size));
};
export function likelySameDedupIdentity(left: DedupIdentity, right: DedupIdentity) {
  if (left.key === right.key) return { same: true, confidence: Math.min(left.confidence, right.confidence), reason: left.reasons[0] };
  if (left.cycle && right.cycle && left.cycle !== right.cycle) return { same: false, confidence: 0, reason: "ciclos diferentes" };
  if (left.company && right.company && left.company !== right.company) return { same: false, confidence: 0, reason: "empresas diferentes" };
  const shared = left.tokens.filter((token) => right.tokens.includes(token));
  const score = overlap(left.tokens, right.tokens);
  const programs = left.program && right.program;
  const distinctiveShared = shared.filter((token) => token.length >= 3);
  const compatibleLocation = !left.location || !right.location || left.location === right.location || left.location.includes(right.location) || right.location.includes(left.location);
  const sameProgram = programs && (score >= 0.6 || distinctiveShared.length >= 2);
  const sameRole = !programs && Boolean(left.company && right.company) && compatibleLocation && score >= 0.85;
  const same = sameProgram || sameRole;
  return {
    same,
    confidence: same ? Math.max(sameRole ? 88 : 80, Math.round(score * 100)) : Math.round(score * 100),
    reason: sameRole ? "mesma empresa, função altamente semelhante e local compatível" : "programas com entidade e termos distintivos compatíveis",
  };
}

export function likelySameOpportunity(a: IdentityInput, b: IdentityInput) {
  return likelySameDedupIdentity(buildDedupIdentity(a), buildDedupIdentity(b));
}
