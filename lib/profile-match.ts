import type { Job, UserProfile } from "./types";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

export interface RuleMatch {
  score: number;
  strengths: string[];
  gaps: string[];
  concerns: string[];
}

export function ruleProfileMatch(profile: UserProfile, job: Job): RuleMatch {
  const haystack = normalize(`${job.title} ${job.company} ${job.description} ${job.location}`);
  const strengths: string[] = [];
  const gaps: string[] = [];
  const concerns: string[] = [];
  let score = 20;

  const skillHits = profile.skills.filter((term) => haystack.includes(normalize(term)));
  if (profile.skills.length) {
    score += Math.min(35, Math.round((skillHits.length / profile.skills.length) * 35));
    if (skillHits.length) strengths.push(`Competências em comum: ${skillHits.slice(0, 5).join(", ")}`);
    const missing = profile.skills.filter((term) => !skillHits.includes(term)).slice(0, 4);
    if (missing.length) gaps.push(`Competências não mencionadas: ${missing.join(", ")}`);
  }

  const roleHits = profile.desired_roles.filter((term) => haystack.includes(normalize(term)));
  if (roleHits.length) {
    score += 20;
    strengths.push(`Área desejada: ${roleHits.slice(0, 3).join(", ")}`);
  } else if (profile.desired_roles.length) {
    gaps.push("A vaga não explicita uma das funções desejadas.");
  }

  const locationHit = job.work_mode === "remote" || profile.preferred_locations.some((term) => haystack.includes(normalize(term)));
  const modeHit = profile.preferred_work_modes.length === 0 || profile.preferred_work_modes.includes(job.work_mode);
  if (locationHit || modeHit) {
    score += 15;
    strengths.push("Modelo/localização compatível.");
  } else if (profile.preferred_locations.length || profile.preferred_work_modes.length) {
    score -= 15;
    concerns.push("Modelo ou localização fora das preferências informadas.");
  }

  if (profile.target_start && haystack.includes(normalize(profile.target_start))) {
    score += 10;
    strengths.push(`Início ${profile.target_start} mencionado.`);
  }

  const blockers = profile.dealbreakers.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
  const blockerHits = blockers.filter((term) => haystack.includes(normalize(term)));
  if (blockerHits.length) {
    score -= Math.min(45, blockerHits.length * 20);
    concerns.push(`Possíveis impeditivos: ${blockerHits.join(", ")}`);
  }

  return { score: Math.max(0, Math.min(100, score)), strengths: unique(strengths), gaps: unique(gaps), concerns: unique(concerns) };
}
