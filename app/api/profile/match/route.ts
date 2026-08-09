import { NextRequest, NextResponse } from "next/server";
import { analyzeWithGroq } from "@/lib/groq";
import { getOptionalUser } from "@/lib/auth";
import { isVisibleForPreferences, preferencesFromProfile } from "@/lib/job-preferences";
import { ruleProfileMatch } from "@/lib/profile-match";
import { getSupabaseAdmin, hasDatabaseConfig } from "@/lib/supabase";
import type { Job, UserProfile } from "@/lib/types";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const user = await getOptionalUser();
  if (!user) return NextResponse.json({ error: "Faça login para analisar seu perfil." }, { status: 401 });
  if (!hasDatabaseConfig()) return NextResponse.json({ error: "Banco de dados não configurado." }, { status: 503 });
  const body = await request.json().catch(() => ({})) as { limit?: unknown; use_ai?: unknown };
  const limit = Math.max(1, Math.min(30, Number(body.limit) || 20));
  const supabase = getSupabaseAdmin();
  const profileResult = await supabase.from("user_profiles").select("*").eq("user_id", user.id).maybeSingle();
  if (profileResult.error) return NextResponse.json({ error: profileResult.error.message }, { status: 400 });
  if (!profileResult.data) return NextResponse.json({ error: "Salve o perfil antes de analisar vagas." }, { status: 400 });
  const profile = profileResult.data as UserProfile & { id: string };

  const jobsResult = await supabase.from("jobs").select("*")
    .in("display_tier", ["strong", "watchlist"])
    .eq("is_active", true).is("duplicate_of", null)
    .order("score", { ascending: false }).order("discovered_at", { ascending: false }).limit(500);
  if (jobsResult.error) return NextResponse.json({ error: jobsResult.error.message }, { status: 400 });
  const preferences = preferencesFromProfile(profile);
  const jobs = ((jobsResult.data ?? []) as Job[]).filter((job) => isVisibleForPreferences(job, preferences))
    .sort((left, right) => (right.display_tier === "strong" ? 1 : 0) - (left.display_tier === "strong" ? 1 : 0) || right.score - left.score)
    .slice(0, limit);
  const ruleMatches = new Map(jobs.map((job) => [job.id, ruleProfileMatch(profile, job)]));

  let aiMatches = new Map<string, Awaited<ReturnType<typeof analyzeWithGroq>>["matches"][number]>();
  let model: string | null = null;
  let warning: string | null = null;
  const wantsAi = body.use_ai === true && profile.ai_enabled;
  if (wantsAi && process.env.GROQ_API && jobs.length) {
    try {
      const result = await analyzeWithGroq(profile, jobs);
      model = result.model;
      aiMatches = new Map(result.matches.map((match) => [match.job_id, match]));
    } catch (error) {
      warning = error instanceof Error ? error.message : "Falha na análise Groq.";
    }
  } else if (wantsAi && !process.env.GROQ_API) {
    warning = "GROQ_API não configurada; foi aplicada somente a análise por regras.";
  }

  const rows = jobs.map((job) => {
    const rules = ruleMatches.get(job.id)!;
    const ai = aiMatches.get(job.id);
    const aiScore = ai ? Math.max(0, Math.min(100, Math.round(ai.score))) : null;
    return {
      job_id: job.id,
      profile_id: profile.id,
      rules_score: rules.score,
      ai_score: aiScore,
      final_score: aiScore === null ? rules.score : Math.round(rules.score * 0.3 + aiScore * 0.7),
      summary: ai?.summary || "Aderência calculada pelas preferências e competências informadas.",
      strengths: ai?.strengths?.slice(0, 8) || rules.strengths,
      gaps: ai?.gaps?.slice(0, 8) || rules.gaps,
      concerns: ai?.concerns?.slice(0, 8) || rules.concerns,
      model,
      analyzed_at: new Date().toISOString(),
    };
  });
  if (rows.length) {
    const { error } = await supabase.from("job_profile_matches").upsert(rows, { onConflict: "job_id,profile_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ analyzed: rows.length, usedAi: Boolean(model), warning });
}
