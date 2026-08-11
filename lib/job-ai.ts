import type { JobValidationInput } from "./job-validation";

export const JOB_PROMPT_VERSION = "job-extraction-v4-structured";
export const JOB_AI_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-20b";

export interface JobAiResult {
  index: number;
  is_job: boolean;
  is_internship: boolean;
  target_start: "confirmed" | "probable" | "unknown" | "incompatible";
  location_fit: "confirmed" | "probable" | "unknown" | "incompatible";
  area_fit: "tech" | "general" | "non_tech" | "ambiguous";
  work_mode: "remote" | "hybrid" | "onsite" | "unknown";
  company: string;
  title: string;
  application_deadline: string;
  salary_min: number;
  salary_max: number;
  salary_period: "hour" | "month" | "year" | "unknown";
  workload_hours_week: number;
  benefits: string[];
  requirements: string[];
  responsibilities: string[];
  education_requirements: string[];
  skills: string[];
  confidence: number;
  reasons: string[];
  evidence: string[];
}

export async function analyzeJobBatch(jobs: JobValidationInput[]): Promise<JobAiResult[]> {
  if (!process.env.GROQ_API) throw new Error("GROQ_API não configurada");
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.GROQ_API}`, "content-type": "application/json" },
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      model: JOB_AI_MODEL,
      temperature: 0.1,
      messages: [
        { role: "system", content: "Extraia fatos de anúncios de estágio sem inventar campos ausentes. Valores numéricos desconhecidos devem ser 0 e listas desconhecidas devem ser vazias. Classifique area_fit como tech para dados, IA, software, QA, produto digital, UX/UI, cibersegurança, cloud, infraestrutura ou BI; general para programa amplo; non_tech para saúde assistencial, RH tradicional, direito, química ou engenharias não tecnológicas; ambiguous quando faltar evidência. Uma função explicitamente tecnológica prevalece sobre o departamento. 2027 sem semestre é provável; 2027.1/jan-fev-mar é confirmado. Anos no histórico da empresa não indicam o ciclo da vaga. Use incompatible somente quando início/ciclo ou local presencial forem explicitamente incompatíveis; ausência de informação é unknown. São Paulo ou remoto são compatíveis. application_deadline deve ser uma data ISO 8601 ou string vazia; nunca escreva unknown nesse campo. Extraia salário, carga semanal, benefícios, requisitos, responsabilidades, formação e competências somente quando aparecerem no anúncio. Responda em português e cite trechos curtos como evidência." },
        { role: "user", content: JSON.stringify(jobs.map((job, index) => ({ index, title: job.title, company: job.company, location: job.location, work_mode: job.work_mode, description: (job.description || "").slice(0, 5000), url: job.source_url }))) },
      ],
      response_format: { type: "json_schema", json_schema: { name: "job_analysis", strict: true, schema: {
        type: "object", additionalProperties: false, required: ["results"], properties: { results: { type: "array", items: {
          type: "object", additionalProperties: false,
          required: ["index", "is_job", "is_internship", "target_start", "location_fit", "area_fit", "work_mode", "company", "title", "application_deadline", "salary_min", "salary_max", "salary_period", "workload_hours_week", "benefits", "requirements", "responsibilities", "education_requirements", "skills", "confidence", "reasons", "evidence"],
          properties: {
            index: { type: "integer" }, is_job: { type: "boolean" }, is_internship: { type: "boolean" },
            target_start: { type: "string", enum: ["confirmed", "probable", "unknown", "incompatible"] },
            location_fit: { type: "string", enum: ["confirmed", "probable", "unknown", "incompatible"] },
            area_fit: { type: "string", enum: ["tech", "general", "non_tech", "ambiguous"] },
            work_mode: { type: "string", enum: ["remote", "hybrid", "onsite", "unknown"] },
            company: { type: "string" }, title: { type: "string" }, application_deadline: { type: "string" },
            salary_min: { type: "number", minimum: 0 }, salary_max: { type: "number", minimum: 0 },
            salary_period: { type: "string", enum: ["hour", "month", "year", "unknown"] },
            workload_hours_week: { type: "number", minimum: 0 },
            benefits: { type: "array", items: { type: "string" } },
            requirements: { type: "array", items: { type: "string" } },
            responsibilities: { type: "array", items: { type: "string" } },
            education_requirements: { type: "array", items: { type: "string" } },
            skills: { type: "array", items: { type: "string" } },
            confidence: { type: "integer", minimum: 0, maximum: 100 },
            reasons: { type: "array", items: { type: "string" } }, evidence: { type: "array", items: { type: "string" } },
          },
        } } },
      } } },
    }),
  });
  if (!response.ok) throw new Error(`Groq ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Resposta Groq vazia");
  return (JSON.parse(content) as { results: JobAiResult[] }).results;
}
