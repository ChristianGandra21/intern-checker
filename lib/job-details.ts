import type { JobValidationInput } from "./job-validation";
import type { JobAiResult } from "./job-ai";

const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];
const money = (value: string) => Number(value.replace(/\./g, "").replace(",", "."));

const BENEFITS = [
  ["vale-refeição", /\b(?:vale[- ]?refei[cç][aã]o|vr)\b/i],
  ["vale-alimentação", /\b(?:vale[- ]?alimenta[cç][aã]o|va)\b/i],
  ["vale-transporte", /\b(?:vale[- ]?transporte|vt)\b/i],
  ["plano de saúde", /\b(?:plano|assist[eê]ncia) de sa[uú]de\b/i],
  ["plano odontológico", /\b(?:plano|assist[eê]ncia) odontol[oó]gic[oa]\b/i],
  ["seguro de vida", /\bseguro de vida\b/i],
  ["auxílio home office", /\baux[ií]lio (?:home office|remoto)\b/i],
] as const;

const SKILLS = [
  "Python", "SQL", "Java", "JavaScript", "TypeScript", "React", "Node.js", "AWS", "Azure",
  "GCP", "Power BI", "Tableau", "Excel", "Git", "Docker", "Kubernetes", "Linux", "SAP",
  "Machine Learning", "Inteligência Artificial", "Data Science", "Cybersecurity", "QA",
];

function sectionLines(text: string, heading: RegExp) {
  const lines = text.split(/\n+/).map((line) => line.replace(/^\s*[-•*]\s*/, "").trim()).filter(Boolean);
  const start = lines.findIndex((line) => heading.test(line));
  if (start < 0) return [];
  const values: string[] = [];
  for (const line of lines.slice(start + 1, start + 9)) {
    if (/^(benef[ií]cios|requisitos|responsabilidades|atividades|sobre (?:a empresa|n[oó]s))\s*:?$/i.test(line)) break;
    if (line.length >= 8 && line.length <= 300) values.push(line);
  }
  return values;
}

export function extractJobDetails(input: Pick<JobValidationInput, "title" | "description">, ai?: JobAiResult | null) {
  const text = `${input.title}\n${input.description || ""}`;
  const salary = text.match(/R\$\s*([\d.]+(?:,\d{1,2})?)(?:\s*(?:a|até|[-–])\s*R?\$?\s*([\d.]+(?:,\d{1,2})?))?/i);
  const weekly = text.match(/(\d{1,2}(?:[,.]\d+)?)\s*horas?\s*(?:semanais|por semana)/i);
  const daily = text.match(/(\d(?:[,.]\d+)?)\s*h(?:oras?)?\s*(?:di[aá]rias|por dia)/i);
  const benefits = BENEFITS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
  const skills = SKILLS.filter((skill) => new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));
  const education = unique([
    ...(text.match(/(?:cursando|gradua[cç][aã]o em|superior em)\s+[^.;\n]{4,180}/gi) || []),
    ...(ai?.education_requirements || []),
  ]).slice(0, 12);
  const requirements = unique([
    ...sectionLines(text, /^(?:requisitos|o que esperamos|quem buscamos)\s*:?$/i),
    ...(ai?.requirements || []),
  ]).slice(0, 16);
  const responsibilities = unique([
    ...sectionLines(text, /^(?:responsabilidades|atividades|seu dia a dia)\s*:?$/i),
    ...(ai?.responsibilities || []),
  ]).slice(0, 16);
  const salaryMin = ai?.salary_min || (salary ? money(salary[1]) : null);
  const salaryMax = ai?.salary_max || (salary?.[2] ? money(salary[2]) : salaryMin);
  const workload = ai?.workload_hours_week || (weekly ? Number(weekly[1].replace(",", ".")) : daily ? Number(daily[1].replace(",", ".")) * 5 : null);
  return {
    salary_min: salaryMin || null,
    salary_max: salaryMax || null,
    salary_period: ai?.salary_period && ai.salary_period !== "unknown" ? ai.salary_period : salary ? "month" as const : null,
    workload_hours_week: workload || null,
    benefits: unique([...benefits, ...(ai?.benefits || [])]).slice(0, 16),
    requirements,
    responsibilities,
    education_requirements: education,
    extracted_skills: unique([...skills, ...(ai?.skills || [])]).slice(0, 24),
    details_confidence: {
      salary: salaryMin ? (ai?.salary_min ? 0.85 : 0.95) : 0,
      workload: workload ? (ai?.workload_hours_week ? 0.8 : 0.95) : 0,
      benefits: benefits.length || ai?.benefits?.length ? 0.8 : 0,
      requirements: requirements.length ? 0.75 : 0,
      responsibilities: responsibilities.length ? 0.75 : 0,
      skills: skills.length || ai?.skills?.length ? 0.85 : 0,
    },
    details_extracted_at: new Date().toISOString(),
  };
}
