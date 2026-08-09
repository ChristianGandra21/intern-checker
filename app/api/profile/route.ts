import { NextRequest, NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { isVisibleForPreferences, preferencesFromProfile } from "@/lib/job-preferences";
import { getSupabaseAdmin, hasDatabaseConfig } from "@/lib/supabase";
import type { UserProfile, WorkMode } from "@/lib/types";

const workModes = new Set<WorkMode>(["remote", "hybrid", "onsite", "unknown"]);
const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const list = (value: unknown, maxItems = 40) => Array.isArray(value)
  ? [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 100)).filter(Boolean))].slice(0, maxItems)
  : [];

const unauthorized = () => NextResponse.json({ error: "Faça login para acessar seu perfil." }, { status: 401 });

export async function GET() {
  const user = await getOptionalUser();
  if (!user) return unauthorized();
  if (!hasDatabaseConfig()) return NextResponse.json({ error: "Banco de dados não configurado." }, { status: 503 });
  const supabase = getSupabaseAdmin();
  const { data: profile, error } = await supabase.from("user_profiles").select("*").eq("user_id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  let matches: unknown[] = [];
  if (profile?.id) {
    const result = await supabase
      .from("job_profile_matches")
      .select("job_id,rules_score,ai_score,final_score,summary,strengths,gaps,concerns,model,analyzed_at,jobs(id,title,company,description,source_url,location,work_mode,score,primary_area,area_tags,verification_level,display_tier,is_active,duplicate_of)")
      .eq("profile_id", profile.id)
      .order("final_score", { ascending: false })
      .limit(30);
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
    const preferences = preferencesFromProfile(profile);
    matches = (result.data ?? []).filter((match) => {
      const job = Array.isArray(match.jobs) ? match.jobs[0] : match.jobs;
      return job && job.is_active && !job.duplicate_of && ["strong", "watchlist"].includes(job.display_tier)
        && isVisibleForPreferences(job as unknown as import("@/lib/types").Job, preferences);
    });
  }
  return NextResponse.json({ profile, matches, groqConfigured: Boolean(process.env.GROQ_API) });
}

export async function PUT(request: NextRequest) {
  const user = await getOptionalUser();
  if (!user) return unauthorized();
  if (!hasDatabaseConfig()) return NextResponse.json({ error: "Banco de dados não configurado." }, { status: 503 });
  const raw = await request.json().catch(() => null) as Partial<UserProfile> | null;
  if (!raw) return NextResponse.json({ error: "Perfil inválido." }, { status: 400 });

  const preferredModes = list(raw.preferred_work_modes, 4).filter((mode): mode is WorkMode => workModes.has(mode as WorkMode));
  const profile = {
    singleton: true,
    user_id: user.id,
    name: text(raw.name, 120),
    goals: text(raw.goals, 5000),
    resume_text: text(raw.resume_text, 30000),
    skills: list(raw.skills),
    desired_roles: list(raw.desired_roles, 20),
    preferred_locations: list(raw.preferred_locations, 20),
    preferred_work_modes: preferredModes,
    target_start: text(raw.target_start, 40) || "2027.1",
    dealbreakers: text(raw.dealbreakers, 5000),
    ai_enabled: raw.ai_enabled === true,
    excluded_area_categories: list(raw.excluded_area_categories, 30),
    excluded_area_terms: list(raw.excluded_area_terms, 50),
  };
  const { data, error } = await getSupabaseAdmin().from("user_profiles").upsert(profile, { onConflict: "user_id" }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ profile: data });
}
