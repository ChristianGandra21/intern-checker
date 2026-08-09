import type { Job, UserProfile } from "./types";

interface AiMatch {
  job_id: string;
  score: number;
  summary: string;
  strengths: string[];
  gaps: string[];
  concerns: string[];
}

const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-20b";

function profileContext(profile: UserProfile) {
  return {
    objectives: profile.goals.slice(0, 5000),
    resume: profile.resume_text.slice(0, 12000),
    skills: profile.skills,
    desired_roles: profile.desired_roles,
    preferred_locations: profile.preferred_locations,
    preferred_work_modes: profile.preferred_work_modes,
    target_start: profile.target_start,
    dealbreakers: profile.dealbreakers.slice(0, 3000),
  };
}

async function analyzeBatch(profile: UserProfile, jobs: Job[]): Promise<AiMatch[]> {
  const apiKey = process.env.GROQ_API;
  if (!apiKey) throw new Error("GROQ_API não configurada.");

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: "Você compara vagas de estágio com um perfil profissional. Use apenas as evidências fornecidas. Ausência de informação é incerteza, não incompatibilidade. Não infira atributos sensíveis. Seja objetivo, responda em português e mantenha cada texto curto.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Avalie de 0 a 100 a aderência de cada vaga ao perfil. Considere objetivos, experiência, competências, função, localização, início e impeditivos.",
            profile: profileContext(profile),
            jobs: jobs.map((job) => ({
              job_id: job.id,
              title: job.title,
              company: job.company,
              description: job.description.slice(0, 2500),
              location: job.location,
              work_mode: job.work_mode,
              general_score: job.score,
            })),
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "profile_job_matches",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              matches: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    job_id: { type: "string" },
                    score: { type: "integer", minimum: 0, maximum: 100 },
                    summary: { type: "string" },
                    strengths: { type: "array", items: { type: "string" } },
                    gaps: { type: "array", items: { type: "string" } },
                    concerns: { type: "array", items: { type: "string" } },
                  },
                  required: ["job_id", "score", "summary", "strengths", "gaps", "concerns"],
                },
              },
            },
            required: ["matches"],
          },
        },
      },
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Groq retornou ${response.status}: ${detail.slice(0, 300)}`);
  }
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq retornou uma resposta vazia.");
  const parsed = JSON.parse(content) as { matches?: AiMatch[] };
  return parsed.matches ?? [];
}

export async function analyzeWithGroq(profile: UserProfile, jobs: Job[]) {
  const results: AiMatch[] = [];
  for (let index = 0; index < jobs.length; index += 5) {
    results.push(...await analyzeBatch(profile, jobs.slice(index, index + 5)));
  }
  return { model: MODEL, matches: results };
}
