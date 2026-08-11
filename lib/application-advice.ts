import type { TrackedApplication, UserProfile } from "./types";

export interface AdviceResult {
  strengths: string[];
  gaps: string[];
  keywords: string[];
  resume_suggestions: string[];
  study_topics: string[];
  interview_questions: string[];
  next_steps: string[];
  overall_assessment: string;
  company_culture_assessment: string[];
  pitch_strengths: string[];
  pitch_improvements: string[];
  analyzed_resume: boolean;
  analyzed_pitch: boolean;
  model: string | null;
}

export interface AdviceOptions {
  analyzeResume: boolean;
  analyzePitch: boolean;
}

const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-20b";
const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];

export function ruleApplicationAdvice(profile: UserProfile, application: TrackedApplication, options: AdviceOptions): AdviceResult {
  const text = `${application.title} ${application.description}`.toLocaleLowerCase("pt-BR");
  const pitch = application.candidate_pitch?.trim() || "";
  const normalizedPitch = pitch.toLocaleLowerCase("pt-BR");
  const resume = application.application_resume_text?.trim() || profile.resume_text;
  const skills = unique(profile.skills.filter((skill) => text.includes(skill.toLocaleLowerCase("pt-BR"))));
  const missing = unique(profile.skills.filter((skill) => !text.includes(skill.toLocaleLowerCase("pt-BR")))).slice(0, 5);
  const keywords = unique([
    ...profile.skills.filter((skill) => text.includes(skill.toLocaleLowerCase("pt-BR"))),
    ...(application.description.match(/\b(?:Python|SQL|Power BI|Excel|AWS|Azure|Java|JavaScript|React|dados|analytics|cloud|scrum|agile)\b/gi) || []),
  ]).slice(0, 12);
  return {
    strengths: skills.length ? skills.map((skill) => `Seu perfil menciona ${skill}, presente na oportunidade.`) : ["Seu interesse declarado por estágio permite avaliar esta oportunidade no radar pessoal."],
    gaps: missing.length ? missing.map((skill) => `Confirme se ${skill} é relevante para a vaga e prepare uma evidência prática.`) : ["A descrição não permite identificar lacunas objetivas adicionais."],
    keywords,
    resume_suggestions: options.analyzeResume ? keywords.slice(0, 5).map((keyword) => `Se for verdadeiro, evidencie um projeto ou resultado relacionado a ${keyword}.`) : [],
    study_topics: keywords.slice(0, 4),
    interview_questions: [
      `Por que você quer atuar na ${application.company}?`,
      `Qual projeto demonstra melhor sua capacidade para ${application.title}?`,
      "Conte uma situação em que precisou aprender algo rapidamente.",
    ],
    next_steps: ["Revisar os requisitos obrigatórios", "Selecionar dois projetos relevantes", "Preparar exemplos no formato situação–ação–resultado", "Revisar o prazo e o link oficial"],
    overall_assessment: options.analyzeResume
      ? resume.trim() ? "Há material suficiente para comparar currículo e vaga; valide as lacunas e adapte somente afirmações sustentadas por experiências reais." : "A análise de currículo foi solicitada, mas não há currículo nesta candidatura nem no perfil."
      : "A oportunidade foi analisada sem avaliar o currículo. Você pode incluir essa etapa em uma próxima análise.",
    company_culture_assessment: application.company_context || application.company_culture || application.company_reviews
      ? ["Separe fatos institucionais de opiniões individuais.", "Transforme os sinais culturais fornecidos em perguntas para validar durante as entrevistas."]
      : ["Adicione informações sobre empresa, cultura ou opiniões para preparar perguntas de validação."],
    pitch_strengths: options.analyzePitch && pitch ? [
      normalizedPitch.includes(application.company.toLocaleLowerCase("pt-BR")) ? "O pitch cita a empresa e demonstra direcionamento." : "O pitch fornece uma base pessoal para refinamento.",
    ] : [],
    pitch_improvements: options.analyzePitch && pitch ? [
      ...(!normalizedPitch.includes(application.company.toLocaleLowerCase("pt-BR")) ? [`Conecte explicitamente seu interesse à ${application.company}.`] : []),
      ...(!/\d|resultado|impacto|projeto|experi[eê]ncia/i.test(pitch) ? ["Inclua uma evidência concreta de projeto, resultado ou impacto."] : []),
      `Explique em uma frase por que seu repertório é relevante para ${application.title}.`,
    ] : options.analyzePitch ? ["Adicione um pitch para receber recomendações específicas."] : [],
    analyzed_resume: options.analyzeResume,
    analyzed_pitch: options.analyzePitch,
    model: null,
  };
}

export async function analyzeApplicationAdvice(profile: UserProfile, application: TrackedApplication, options: AdviceOptions): Promise<AdviceResult> {
  const fallback = ruleApplicationAdvice(profile, application, options);
  if (!profile.ai_enabled || !process.env.GROQ_API) return fallback;
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST", signal: AbortSignal.timeout(45_000),
    headers: { authorization: `Bearer ${process.env.GROQ_API}`, "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, temperature: 0.1, messages: [
      { role: "system", content: "Você é um orientador de candidatura. Forneça feedback específico, verificável e revisável. Não invente experiências nem trate opiniões sobre a empresa como fatos. Diferencie evidências da vaga, informações institucionais e percepções de terceiros. Não execute nem sugira envio automático. Responda em português com itens curtos." },
      { role: "user", content: JSON.stringify({ task: "Analise a oportunidade e ajude a pessoa a se preparar. Analise currículo e pitch somente quando os respectivos campos de escopo forem verdadeiros; quando forem falsos, devolva arrays vazios para as seções correspondentes.", scope: { analyze_resume: options.analyzeResume, analyze_pitch: options.analyzePitch }, profile: { goals: profile.goals, resume: options.analyzeResume ? (application.application_resume_text?.trim() || profile.resume_text).slice(0, 12000) : "", skills: profile.skills, roles: profile.desired_roles, dealbreakers: profile.dealbreakers }, application: { title: application.title, company: application.company, description: application.description.slice(0, 10000), location: application.location, work_mode: application.work_mode, company_context: application.company_context?.slice(0, 8000), company_culture: application.company_culture?.slice(0, 6000), company_reviews: application.company_reviews?.slice(0, 8000), candidate_pitch: options.analyzePitch ? application.candidate_pitch?.slice(0, 5000) : "" } }) },
    ], response_format: { type: "json_schema", json_schema: { name: "application_advice", strict: true, schema: { type: "object", additionalProperties: false, properties: {
      strengths: { type: "array", items: { type: "string" } }, gaps: { type: "array", items: { type: "string" } }, keywords: { type: "array", items: { type: "string" } }, resume_suggestions: { type: "array", items: { type: "string" } }, study_topics: { type: "array", items: { type: "string" } }, interview_questions: { type: "array", items: { type: "string" } }, next_steps: { type: "array", items: { type: "string" } }, overall_assessment: { type: "string" }, company_culture_assessment: { type: "array", items: { type: "string" } }, pitch_strengths: { type: "array", items: { type: "string" } }, pitch_improvements: { type: "array", items: { type: "string" } },
    }, required: ["strengths", "gaps", "keywords", "resume_suggestions", "study_topics", "interview_questions", "next_steps", "overall_assessment", "company_culture_assessment", "pitch_strengths", "pitch_improvements"] } } } }),
  });
  if (!response.ok) throw new Error(`Groq retornou ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq retornou uma resposta vazia.");
  const result = JSON.parse(content) as Omit<AdviceResult, "model" | "analyzed_resume" | "analyzed_pitch">;
  return { ...result, analyzed_resume: options.analyzeResume, analyzed_pitch: options.analyzePitch, model: MODEL };
}
