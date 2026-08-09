import { NextRequest, NextResponse } from "next/server";
import { getDashboardData } from "@/lib/data";
import { validIngestKey } from "@/lib/ingest-auth";
import { buildDedupIdentity, likelySameOpportunity } from "@/lib/job-identity";
import { validateJob, type JobValidationInput } from "@/lib/job-validation";
import { getSupabaseAdmin, hasDatabaseConfig } from "@/lib/supabase";
import type { JobFilters } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const filters: JobFilters = {
    query: params.get("q") ?? undefined,
    source: params.get("source") ?? undefined,
    mode: params.get("mode") ?? undefined,
    status: params.get("status") ?? undefined,
    minScore: Number(params.get("min_score") ?? 0),
    discoveredFrom: params.get("date_from") ?? undefined,
    discoveredTo: params.get("date_to") ?? undefined,
    tier: params.get("tier") === "strong" ? "strong" : "radar",
    page: Math.max(1, Number(params.get("page")) || 1),
    pageSize: Math.min(50, Math.max(1, Number(params.get("page_size")) || 20)),
  };

  try {
    return NextResponse.json(await getDashboardData(filters));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao carregar vagas." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!validIngestKey(request.headers.get("x-ingest-key"))) {
    return NextResponse.json({ error: "Chave de ingestão inválida." }, { status: 401 });
  }
  if (!hasDatabaseConfig()) {
    return NextResponse.json({ error: "Banco de dados não configurado." }, { status: 503 });
  }

  const body = await request.json().catch(() => null) as { jobs?: unknown[]; run?: Record<string, unknown> } | null;
  if (!body?.jobs || !Array.isArray(body.jobs) || body.jobs.length > 500) {
    return NextResponse.json({ error: "Envie um array jobs com no máximo 500 itens." }, { status: 400 });
  }

  const allowed = ["title", "company", "description", "location", "work_mode", "source", "source_url", "published_at", "discovered_at", "score", "score_reasons", "match_area", "area_fit", "area_reasons", "match_location", "match_start", "fingerprint", "official_url", "application_url", "external_id"] as const;
  const sanitized = body.jobs.map((raw) => {
    const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    return Object.fromEntries(allowed.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
  });
  if (sanitized.some((job) => typeof job.fingerprint !== "string" || !job.fingerprint)) {
    return NextResponse.json({ error: "Toda vaga precisa de fingerprint para deduplicação." }, { status: 400 });
  }
  if (sanitized.some((job) => typeof job.title !== "string" || typeof job.source !== "string" || typeof job.source_url !== "string")) {
    return NextResponse.json({ error: "Toda vaga precisa de título, fonte e URL válidos." }, { status: 400 });
  }

  type IncomingJob = Record<string, unknown> & JobValidationInput & { fingerprint: string; description?: string };
  const typedJobs = sanitized as unknown as IncomingJob[];
  const validated = typedJobs.map((job) => {
    const validation = validateJob(job);
    const identity = buildDedupIdentity(job);
    return {
      ...job,
      ...validation,
      dedup_group_key: identity.key,
      dedup_confidence: identity.confidence,
      dedup_reasons: identity.reasons,
      verification_level: validation.validation_status === "accepted" ? "probable" : validation.validation_status === "rejected" ? "rejected" : "review",
    };
  });
  const jobs: typeof validated = [];
  for (const job of [...validated].sort((a, b) => (b.quality_score * 10 + String(b.description || "").length) - (a.quality_score * 10 + String(a.description || "").length))) {
    if (jobs.some((other) => other.dedup_group_key === job.dedup_group_key || likelySameOpportunity(other, job).same)) continue;
    jobs.push(job);
  }

  const supabase = getSupabaseAdmin();
  const radarSchema = await supabase.from("jobs").select("display_tier,target_fit,location_fit").limit(1);
  if (radarSchema.error) return NextResponse.json({ error: "Execute a migration 007 antes de usar a ingestão legada.", detail: radarSchema.error.message }, { status: 409 });
  const canonicalKeys = jobs.map((job) => job.canonical_key);
  const identityKeys = jobs.map((job) => job.identity_key).filter((key): key is string => Boolean(key));
  async function lookupExisting(column: "canonical_key" | "identity_key", keys: string[]) {
    const rows: Array<{ canonical_key?: string | null; identity_key?: string | null; fingerprint: string }> = [];
    for (let index = 0; index < keys.length; index += 80) {
      const result = await supabase.from("jobs").select(`${column},fingerprint`).in(column, keys.slice(index, index + 80));
      if (result.error) throw new Error(result.error.message);
      rows.push(...(result.data ?? []));
    }
    return rows;
  }
  let existingCanonical: Awaited<ReturnType<typeof lookupExisting>>;
  let existingIdentity: Awaited<ReturnType<typeof lookupExisting>>;
  const existingGroups = await supabase.from("jobs").select("dedup_group_key,fingerprint").in("dedup_group_key", jobs.map((job) => job.dedup_group_key));
  if (existingGroups.error) return NextResponse.json({ error: "Execute a migration 006 antes de usar a API legada.", detail: existingGroups.error.message }, { status: 409 });
  try {
    [existingCanonical, existingIdentity] = await Promise.all([
      lookupExisting("canonical_key", canonicalKeys),
      lookupExisting("identity_key", identityKeys),
    ]);
  } catch (lookupError) {
    return NextResponse.json({ error: lookupError instanceof Error ? lookupError.message : "Falha ao consultar duplicatas." }, { status: 400 });
  }
  const byCanonical = new Map(existingCanonical.map((job) => [job.canonical_key, job.fingerprint]));
  const byIdentity = new Map(existingIdentity.map((job) => [job.identity_key, job.fingerprint]));
  const byGroup = new Map((existingGroups.data ?? []).map((job) => [job.dedup_group_key, job.fingerprint]));
  for (const job of jobs) {
    const fingerprint = byGroup.get(job.dedup_group_key) || byCanonical.get(job.canonical_key) || (job.identity_key ? byIdentity.get(job.identity_key) : undefined);
    if (fingerprint) job.fingerprint = fingerprint;
  }
  const { data, error } = await supabase.from("jobs").upsert(jobs, { onConflict: "fingerprint", ignoreDuplicates: false }).select("id,source_url");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (body.run) {
    await supabase.from("ingestion_runs").insert({
      status: "success",
      found_count: body.run.found_count ?? jobs.length,
      accepted_count: jobs.filter((job) => job.validation_status === "accepted").length,
      source_summary: body.run.source_summary ?? {},
      finished_at: new Date().toISOString(),
    });
  }

  return NextResponse.json({
    upserted: data?.length ?? jobs.length,
    collapsedDuplicates: sanitized.length - jobs.length,
    accepted: jobs.filter((job) => job.validation_status === "accepted").length,
    review: jobs.filter((job) => job.validation_status === "review").length,
    rejected: jobs.filter((job) => job.validation_status === "rejected").length,
  }, { status: 201 });
}
