import type { JobValidationInput } from "./job-validation";

const GENERIC_COMPANY = /^(?:n[aã]o informada|unknown|rss|mastodon|telegram|google news(?:\s*[—-].*)?)$/i;
const HEADLINE_COMPANY = /^(.{2,90}?)\s+(?:abre|abrem|lan[cç]a|lan[cç]am|oferece|oferecem|anuncia|anunciam|inicia|iniciam|est[aá] com|recebe|recebem|prorroga|prorrogam|contrata|contratam|seleciona|selecionam)\b/i;
const NEWS_SOURCES = new Set(["RSS", "Google Alerts"]);

const cleanCompany = (value: string) => value
  .replace(/^\s*["'“”]+|["'“”]+\s*$/g, "")
  .replace(/\s*[|:]\s*$/, "")
  .replace(/\s+20\d{2}(?:[.\/-]?[12])?\s*$/, "")
  .replace(/\s+/g, " ")
  .trim();

export function isNewsCandidate(job: Pick<JobValidationInput, "source" | "source_type">) {
  return job.source_type === "news" || NEWS_SOURCES.has(job.source);
}

export function usefulCompany(value: string | null | undefined) {
  const company = cleanCompany(value || "");
  return company.length >= 2 && !GENERIC_COMPANY.test(company);
}

export function normalizeCompanyAlias(value: string) {
  return cleanCompany(value);
}

export function inferNewsCompany(job: JobValidationInput) {
  if (usefulCompany(job.company)) return normalizeCompanyAlias(job.company!);
  const headline = job.title.split(/\s+[|–—-]\s+(?=[^|–—-]{2,80}$)/)[0]
    .replace(/^inscri[cç][oõ]es abertas?\s*:\s*/i, "")
    .trim();
  const match = headline.match(HEADLINE_COMPANY);
  if (match && usefulCompany(match[1])) return normalizeCompanyAlias(match[1]);
  // Publisher é evidência de procedência, não necessariamente o empregador.
  return job.company || "Não informada";
}

export function normalizeNewsInput<T extends JobValidationInput>(job: T): T {
  if (!isNewsCandidate(job)) return job;
  return { ...job, company: inferNewsCompany(job) };
}
