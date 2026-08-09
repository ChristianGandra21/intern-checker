import { NextRequest, NextResponse } from "next/server";
import { validIngestKey } from "@/lib/ingest-auth";
import { buildDedupIdentity, likelySameOpportunity } from "@/lib/job-identity";
import { classifyDisplay } from "@/lib/job-display";
import { checkJobUrl, validateJob, type JobValidation, type JobValidationInput } from "@/lib/job-validation";
import { getSupabaseAdmin, hasDatabaseConfig } from "@/lib/supabase";
import type { JobStatus } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type StoredJob = JobValidationInput & Record<string, unknown> & { id: string; description: string; discovered_at: string; score: number };

function rank(job: StoredJob, validation: JobValidation) {
  const official = Boolean(job.official_url || job.application_url || ["greenhouse", "lever", "ashby", "gupy", "workday", "solides", "vagas.com"].some((source) => job.source.toLowerCase().includes(source)));
  return (official ? 1_000_000 : 0)
    + (job.is_active === false ? 0 : 500_000)
    + (validation.validation_status === "accepted" ? 100_000 : validation.validation_status === "review" ? 50_000 : 0)
    + (job.company && job.company !== "Não informada" && job.title ? 10_000 : 0)
    + validation.quality_score * 100
    + Math.min(job.description?.length || 0, 5000)
    + job.score;
}

async function checkLinks(jobs: StoredJob[], validations: Map<string, JobValidation>, limit: number) {
  const candidates = jobs
    .filter((job) => {
      const value = validations.get(job.id)!;
      return value.candidate_kind === "job" && value.validation_status !== "rejected";
    })
    .sort((a, b) => b.score - a.score || Date.parse(b.discovered_at) - Date.parse(a.discovered_at))
    .slice(0, limit);
  for (let index = 0; index < candidates.length; index += 10) {
    const batch = candidates.slice(index, index + 10);
    const results = await Promise.all(batch.map((job) => checkJobUrl(job, validations.get(job.id)!)));
    batch.forEach((job, offset) => validations.set(job.id, results[offset]));
  }
  return candidates.length;
}

export async function POST(request: NextRequest) {
  if (!validIngestKey(request.headers.get("x-ingest-key"))) return NextResponse.json({ error: "Chave de ingestão inválida." }, { status: 401 });
  if (!hasDatabaseConfig()) return NextResponse.json({ error: "Banco de dados não configurado." }, { status: 503 });
  const body = await request.json().catch(() => ({})) as { check_urls?: unknown; url_limit?: unknown; dry_run?: unknown };
  const urlLimit = body.check_urls === true ? Math.max(1, Math.min(50, Number(body.url_limit) || 30)) : 0;
  const supabase = getSupabaseAdmin();
  const schema = await supabase.from("raw_candidates").select("id").limit(1);
  if (schema.error) return NextResponse.json({ error: "Execute as migrations 003 e 004 antes da revalidação.", detail: schema.error.message }, { status: 409 });
  const areaSchema = await supabase.from("jobs").select("area_fit").limit(1);
  if (areaSchema.error) return NextResponse.json({ error: "Execute a migration 005 antes da revalidação.", detail: areaSchema.error.message }, { status: 409 });
  const dedupSchema = await supabase.from("jobs").select("dedup_group_key").limit(1);
  if (dedupSchema.error) return NextResponse.json({ error: "Execute a migration 006 antes da revalidação.", detail: dedupSchema.error.message }, { status: 409 });
  const radarSchema = await supabase.from("jobs").select("display_tier,target_fit,location_fit").limit(1);
  if (radarSchema.error) return NextResponse.json({ error: "Execute a migration 007 antes da revalidação.", detail: radarSchema.error.message }, { status: 409 });
  const result = await supabase.from("jobs").select("*").order("discovered_at", { ascending: false }).limit(5000);
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  const jobs = (result.data ?? []) as StoredJob[];
  const validations = new Map(jobs.map((job) => [job.id, validateJob(job)]));
  const checkedUrls = urlLimit ? await checkLinks(jobs, validations, urlLimit) : 0;

  const duplicateOf = new Map<string, string>();
  const groupKeyById = new Map<string, string>();
  const dedupMeta = new Map<string, ReturnType<typeof buildDedupIdentity>>();
  const groupMatch = new Map<string, { confidence: number; reason: string }>();
  const primaries: StoredJob[] = [];
  for (const job of [...jobs].sort((a, b) => rank(b, validations.get(b.id)!) - rank(a, validations.get(a.id)!))) {
    const validation = validations.get(job.id)!;
    const identity = buildDedupIdentity(job);
    dedupMeta.set(job.id, identity);
    const keys = [validation.canonical_key, validation.identity_key].filter((key): key is string => Boolean(key));
    let matched: { confidence: number; reason: string } | null = null;
    const primary = primaries.find((candidate) => {
      const candidateValidation = validations.get(candidate.id)!;
      const candidateKeys = [candidateValidation.canonical_key, candidateValidation.identity_key, dedupMeta.get(candidate.id)?.key];
      if (candidateKeys.some((key) => key && [...keys, identity.key].includes(key))) {
        matched = { confidence: Math.min(identity.confidence, dedupMeta.get(candidate.id)?.confidence || identity.confidence), reason: "identidade objetiva compartilhada" };
        return true;
      }
      const fuzzy = likelySameOpportunity(candidate, job);
      if (fuzzy.same) matched = { confidence: fuzzy.confidence, reason: fuzzy.reason };
      return fuzzy.same;
    });
    if (primary) {
      duplicateOf.set(job.id, primary.id);
      if (matched) groupMatch.set(job.id, matched);
      groupKeyById.set(job.id, groupKeyById.get(primary.id) || dedupMeta.get(primary.id)!.key);
    } else {
      primaries.push(job);
      groupKeyById.set(job.id, identity.key);
    }
  }

  const statusPriority: Record<JobStatus, number> = { new: 0, dismissed: 1, saved: 2, applied: 3 };
  const primaryFor = (id: string) => duplicateOf.get(id) || id;
  const groupStatus = new Map<string, JobStatus>();
  jobs.forEach((job) => {
    const primaryId = primaryFor(job.id);
    const status = job.status as JobStatus;
    const current = groupStatus.get(primaryId);
    if (!current || statusPriority[status] > statusPriority[current]) groupStatus.set(primaryId, status);
  });

  const updates = jobs.map((job) => {
    const validation = validations.get(job.id)!;
    const primaryId = duplicateOf.get(job.id) || null;
    const ai = job.ai_status === "completed" && job.ai_result && typeof job.ai_result === "object"
      ? job.ai_result as Parameters<typeof classifyDisplay>[2]
      : null;
    const display = classifyDisplay(job, { ...validation, duplicate_of: primaryId }, ai);
    return {
      ...job,
      ...validation,
      dedup_group_key: groupKeyById.get(job.id) || dedupMeta.get(job.id)?.key,
      dedup_confidence: primaryId ? groupMatch.get(job.id)?.confidence || dedupMeta.get(job.id)?.confidence || 0 : dedupMeta.get(job.id)?.confidence || 0,
      dedup_reasons: primaryId ? [...new Set([...(dedupMeta.get(job.id)?.reasons || []), groupMatch.get(job.id)?.reason || "agrupada por identidade global"])] : dedupMeta.get(job.id)?.reasons || [],
      duplicate_of: primaryId,
      status: groupStatus.get(primaryFor(job.id)) || job.status,
      ...display,
      validation_status: display.display_tier === "strong" ? "accepted" : display.display_tier === "watchlist" ? "review" : "rejected",
      verification_level: display.display_tier === "hidden" ? "rejected"
        : display.display_tier === "watchlist" ? "review"
          : validation.validation_reasons.includes("link verificado") || Boolean(job.official_url || job.application_url) ? "confirmed" : "probable",
      validation_reasons: primaryId ? [...new Set([...validation.validation_reasons, "duplicada de outra vaga mais completa"])] : validation.validation_reasons,
    };
  });
  const hiddenByPreferences: typeof updates = [];
  const groupSamples = primaries.slice(0, 20).map((primary) => {
    const members = jobs.filter((job) => primaryFor(job.id) === primary.id);
    return {
      dedup_group_key: groupKeyById.get(primary.id),
      primary: { id: primary.id, title: primary.title, company: primary.company },
      duplicates: members.filter((job) => job.id !== primary.id).map((job) => ({ id: job.id, title: job.title, source: job.source })),
      confidence: Math.min(...members.map((job) => dedupMeta.get(job.id)?.confidence || 0)),
      reasons: [...new Set(members.flatMap((job) => dedupMeta.get(job.id)?.reasons || []))],
    };
  });
  const report = {
    processed: updates.length,
    checkedUrls,
    accepted: updates.filter((job) => job.validation_status === "accepted" && !job.duplicate_of).length,
    review: updates.filter((job) => job.validation_status === "review" && !job.duplicate_of).length,
    rejected: updates.filter((job) => job.validation_status === "rejected").length,
    confirmed: updates.filter((job) => job.verification_level === "confirmed" && !job.duplicate_of).length,
    probable: updates.filter((job) => job.verification_level === "probable" && !job.duplicate_of).length,
    tiers: {
      strong: updates.filter((job) => job.display_tier === "strong" && !job.duplicate_of).length,
      watchlist: updates.filter((job) => job.display_tier === "watchlist" && !job.duplicate_of).length,
      hidden: updates.filter((job) => job.display_tier === "hidden").length,
    },
    transitions: {
      toStrong: updates.filter((job) => job.display_tier === "strong" && job.display_tier !== jobs.find((old) => old.id === job.id)?.display_tier).length,
      toWatchlist: updates.filter((job) => job.display_tier === "watchlist" && job.display_tier !== jobs.find((old) => old.id === job.id)?.display_tier).length,
      toHidden: updates.filter((job) => job.display_tier === "hidden" && job.display_tier !== jobs.find((old) => old.id === job.id)?.display_tier).length,
    },
    duplicates: duplicateOf.size,
    inactive: updates.filter((job) => !job.is_active).length,
    areas: {
      tech: updates.filter((job) => job.area_fit === "tech").length,
      general: updates.filter((job) => job.area_fit === "general").length,
      non_tech: updates.filter((job) => job.area_fit === "non_tech").length,
      ambiguous: updates.filter((job) => job.area_fit === "ambiguous").length,
    },
    groups: primaries.length,
    hiddenByPreferences: hiddenByPreferences.length,
  };
  if (body.dry_run === true) return NextResponse.json({
    ...report,
    dryRun: true,
    sample: updates.filter((job) => !job.duplicate_of).slice(0, 30).map((job) => ({ id: job.id, title: job.title, area_fit: job.area_fit, display_tier: job.display_tier, target_fit: job.target_fit, location_fit: job.location_fit, reasons: job.display_reasons })),
    nonTechSample: updates.filter((job) => job.area_fit === "non_tech").slice(0, 20).map((job) => ({ id: job.id, title: job.title, company: job.company, reasons: job.area_reasons })),
    groupSamples,
    hiddenSample: hiddenByPreferences.slice(0, 20).map((job) => ({ id: job.id, title: job.title, company: job.company, primary_area: job.primary_area, area_tags: job.area_tags })),
  });
  const radarFields = new Set(["display_tier", "target_fit", "location_fit", "display_reasons", "classification_version"]);
  const coreUpdates = updates.map((job) => Object.fromEntries(Object.entries(job).filter(([key]) => !radarFields.has(key))));
  for (let index = 0; index < coreUpdates.length; index += 300) {
    const update = await supabase.from("jobs").upsert(coreUpdates.slice(index, index + 300), { onConflict: "id" });
    if (update.error) return NextResponse.json({ error: update.error.message }, { status: 400 });
  }
  for (const [duplicateId, primaryId] of duplicateOf) {
    const sourceResult = await supabase.from("job_sources").select("source,source_url,external_id,raw_candidate_id,first_seen_at,last_seen_at").eq("job_id", duplicateId);
    if (sourceResult.error) continue;
    if (sourceResult.data?.length) {
      await supabase.from("job_sources").upsert(sourceResult.data.map((source) => ({ ...source, job_id: primaryId })), { onConflict: "job_id,source_url" });
    }
  }
  const radarUpdate = await supabase.rpc("apply_job_radar_classification", {
    payload: updates.map((job) => ({
      id: job.id,
      display_tier: job.display_tier,
      target_fit: job.target_fit,
      location_fit: job.location_fit,
      display_reasons: job.display_reasons,
      classification_version: job.classification_version,
    })),
  });
  if (radarUpdate.error) return NextResponse.json({ error: radarUpdate.error.message, stage: "radar_classification" }, { status: 400 });
  return NextResponse.json(report);
}
