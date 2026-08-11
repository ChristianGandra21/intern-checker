import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { analyzeApplicationAdvice } from "@/lib/application-advice";
import { cleanText } from "@/lib/applications";
import { hasSameOrigin } from "@/lib/admin";
import { getOptionalUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { TrackedApplication, UserProfile } from "@/lib/types";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function context(id: string, userId: string) {
  const db = getSupabaseAdmin();
  const [application, profile] = await Promise.all([
    db.from("tracked_applications").select("*").eq("id", id).eq("user_id", userId).is("deleted_at", null).maybeSingle(),
    db.from("user_profiles").select("*").eq("user_id", userId).maybeSingle(),
  ]);
  return { db, application, profile };
}

export async function GET(_: NextRequest, route: { params: Promise<{ id: string }> }) {
  const user = await getOptionalUser(); if (!user) return NextResponse.json({ error: "Faça login." }, { status: 401 });
  const { id } = await route.params; const { db, application } = await context(id, user.id);
  if (!application.data) return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 });
  const result = await db.from("application_recommendations").select("*").eq("application_id", id).eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (result.error) return NextResponse.json({ error: result.error.message, hint: "Execute a migration 013." }, { status: 400 });
  return NextResponse.json({ recommendation: result.data });
}

export async function POST(request: NextRequest, route: { params: Promise<{ id: string }> }) {
  const user = await getOptionalUser(); if (!user) return NextResponse.json({ error: "Faça login." }, { status: 401 });
  if (!hasSameOrigin(request)) return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  const { id } = await route.params; const { db, application, profile } = await context(id, user.id);
  if (!application.data) return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 });
  if (!profile.data) return NextResponse.json({ error: "Preencha seu perfil antes de analisar a candidatura." }, { status: 400 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const analysisOptions = { analyzeResume: body.analyze_resume === true, analyzePitch: body.analyze_pitch === true };
  const briefingFields = [
    ["description", 10000], ["company_context", 12000], ["company_culture", 8000],
    ["company_reviews", 12000], ["application_resume_text", 30000], ["candidate_pitch", 6000],
  ] as const;
  let app = application.data as TrackedApplication;
  const briefing = Object.fromEntries(briefingFields
    .filter(([key]) => body[key] !== undefined)
    .map(([key, max]) => [key, cleanText(body[key], max)]));
  if (Object.keys(briefing).length) {
    const updated = await db.from("tracked_applications").update(briefing).eq("id", id).eq("user_id", user.id).select("*").single();
    if (updated.error) return NextResponse.json({ error: updated.error.message, hint: "Execute a migration 015." }, { status: 400 });
    app = updated.data as TrackedApplication;
  }
  const userProfile = profile.data as UserProfile;
  if (!app.description.trim()) return NextResponse.json({ error: "A descrição da vaga é obrigatória." }, { status: 400 });
  const effectiveResume = analysisOptions.analyzeResume ? app.application_resume_text?.trim() || userProfile.resume_text : "";
  const contentHash = hash([app.title, app.company, app.description, app.location, app.work_mode, app.company_context, app.company_culture, app.company_reviews, analysisOptions.analyzePitch ? app.candidate_pitch : "", analysisOptions]);
  const profileHash = hash([userProfile.goals, effectiveResume, userProfile.skills, userProfile.desired_roles, userProfile.dealbreakers, analysisOptions]);
  const cached = await db.from("application_recommendations").select("*").eq("application_id", id).eq("content_hash", contentHash).eq("profile_hash", profileHash).maybeSingle();
  if (cached.data) return NextResponse.json({ recommendation: cached.data, cached: true });
  try {
    const advice = await analyzeApplicationAdvice(userProfile, app, analysisOptions);
    const saved = await db.from("application_recommendations").insert({ application_id: id, user_id: user.id, content_hash: contentHash, profile_hash: profileHash, ...advice }).select("*").single();
    if (saved.error) return NextResponse.json({ error: saved.error.message, hint: "Execute as migrations 013 e 015." }, { status: 400 });
    return NextResponse.json({ recommendation: saved.data, cached: false }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Falha na análise." }, { status: 502 }); }
}
