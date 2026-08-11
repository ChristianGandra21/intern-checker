import { NextRequest, NextResponse } from "next/server";
import { validIngestKey } from "@/lib/ingest-auth";
import { buildDedupIdentity, likelySameDedupIdentity } from "@/lib/job-identity";
import { classifyDisplay, hasKnownForeignLocation } from "@/lib/job-display";
import { checkJobUrl, validateJob, type JobValidation, type JobValidationInput } from "@/lib/job-validation";
import { getSupabaseAdmin, hasDatabaseConfig } from "@/lib/supabase";
import { normalizeNewsInput } from "@/lib/news-leads";
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
  const jobs = (result.data ?? []).map((job) => normalizeNewsInput(job as StoredJob)) as StoredJob[];
  const validations = new Map(jobs.map((job) => [job.id, validateJob(job)]));
  const checkedUrls = urlLimit ? await checkLinks(jobs, validations, urlLimit) : 0;

  const duplicateOf = new Map<string, string>();
  const groupKeyById = new Map<string, string>();
  const dedupMeta = new Map<string, ReturnType<typeof buildDedupIdentity>>();
  const groupMatch = new Map<string, { confidence: number; reason: string }>();
  const primaries: StoredJob[] = [];
  const primaryByKey = new Map<string, StoredJob>();
  const primariesByCompany = new Map<string, StoredJob[]>();
  const primariesByToken = new Map<string, StoredJob[]>();
  for (const job of [...jobs].sort((a, b) => rank(b, validations.get(b.id)!) - rank(a, validations.get(a.id)!))) {
    const validation = validations.get(job.id)!;
    const identity = buildDedupIdentity(job);
    dedupMeta.set(job.id, identity);
    const keys = [validation.canonical_key, validation.identity_key].filter((key): key is string => Boolean(key));
    let matched: { confidence: number; reason: string } | null = null;
    const exact = [...keys, identity.key].map((key) => primaryByKey.get(key)).find(Boolean);
    const fuzzyPool = identity.company
      ? primariesByCompany.get(identity.company) || []
      : [...new Set(identity.tokens.slice(0, 4).flatMap((token) => primariesByToken.get(token) || []))];
    const primary = exact || fuzzyPool.find((candidate) => {
      const fuzzy = likelySameDedupIdentity(dedupMeta.get(candidate.id)!, identity);
      if (fuzzy.same) matched = { confidence: fuzzy.confidence, reason: fuzzy.reason };
      return fuzzy.same;
    });
    if (exact) matched = { confidence: Math.min(identity.confidence, dedupMeta.get(exact.id)?.confidence || identity.confidence), reason: "identidade objetiva compartilhada" };
    if (primary) {
      duplicateOf.set(job.id, primary.id);
      if (matched) groupMatch.set(job.id, matched);
      groupKeyById.set(job.id, groupKeyById.get(primary.id) || dedupMeta.get(primary.id)!.key);
    } else {
      primaries.push(job);
      groupKeyById.set(job.id, identity.key);
      [...keys, identity.key].forEach((key) => primaryByKey.set(key, job));
      if (identity.company) primariesByCompany.set(identity.company, [...(primariesByCompany.get(identity.company) || []), job]);
      identity.tokens.slice(0, 4).forEach((token) => primariesByToken.set(token, [...(primariesByToken.get(token) || []), job]));
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
    const corrected = job.manual_fields && typeof job.manual_fields === "object" ? job.manual_fields as Record<string, unknown> : {};
    const finalTier = job.manual_display_tier || display.display_tier;
    const finalKind = job.manual_candidate_kind || validation.candidate_kind;
    const finalTarget = typeof corrected.target_fit === "string" ? corrected.target_fit : display.target_fit;
    const finalLocation = typeof corrected.location_fit === "string" ? corrected.location_fit : display.location_fit;
    return {
      ...job,
      ...validation,
      ...corrected,
      dedup_group_key: groupKeyById.get(job.id) || dedupMeta.get(job.id)?.key,
      dedup_confidence: primaryId ? groupMatch.get(job.id)?.confidence || dedupMeta.get(job.id)?.confidence || 0 : dedupMeta.get(job.id)?.confidence || 0,
      dedup_reasons: primaryId ? [...new Set([...(dedupMeta.get(job.id)?.reasons || []), groupMatch.get(job.id)?.reason || "agrupada por identidade global"])] : dedupMeta.get(job.id)?.reasons || [],
      duplicate_of: primaryId,
      status: groupStatus.get(primaryFor(job.id)) || job.status,
      ...display,
      candidate_kind: finalKind,
      display_tier: finalTier,
      target_fit: finalTarget,
      location_fit: finalLocation,
      display_reasons: job.manual_display_tier ? ["classificação administrativa", ...(display.display_reasons || [])] : display.display_reasons,
      validation_status: finalTier === "strong" ? "accepted" : finalTier === "watchlist" ? "review" : "rejected",
      verification_level: finalTier === "hidden" ? "rejected"
        : finalTier === "watchlist" ? "review"
          : validation.validation_reasons.includes("link verificado") || Boolean(job.official_url || job.application_url) ? "confirmed" : "probable",
      validation_reasons: primaryId ? [...new Set([...validation.validation_reasons, "duplicada de outra vaga mais completa"])] : validation.validation_reasons,
    };
  });
  const registryResult = await supabase.from("source_registry").select("id,adapter,identifier,name").eq("origin", "discovered").eq("enabled", true);
  const sourcesToDisable = (registryResult.data ?? []).filter((source) => !updates.some((job) => {
    const payload = job.raw_payload && typeof job.raw_payload === "object" ? job.raw_payload as Record<string, unknown> : {};
    return payload._registry_identifier === source.identifier
      && job.display_tier !== "hidden" && job.location_fit !== "incompatible" && ["tech", "general"].includes(job.area_fit);
  }));
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
    qualityGuard: {
      knownNoiseVisible: updates.filter((job) => !job.duplicate_of && job.display_tier !== "hidden" && job.candidate_kind === "noise").length,
      foreignVisible: updates.filter((job) => !job.duplicate_of && job.display_tier !== "hidden" && hasKnownForeignLocation(job)).length,
      visibleJobs: updates.filter((job) => !job.duplicate_of && job.display_tier !== "hidden" && job.candidate_kind === "job").length,
      qualifiedLeads: updates.filter((job) => !job.duplicate_of && job.display_tier === "watchlist" && job.candidate_kind === "lead").length,
    },
    sourcesToDisable: sourcesToDisable.map(({ adapter, identifier, name }) => ({ adapter, identifier, name })),
  };
  if (body.dry_run === true) return NextResponse.json({
    ...report,
    dryRun: true,
    sample: updates.filter((job) => !job.duplicate_of).slice(0, 30).map((job) => ({ id: job.id, title: job.title, area_fit: job.area_fit, display_tier: job.display_tier, target_fit: job.target_fit, location_fit: job.location_fit, reasons: job.display_reasons })),
    nonTechSample: updates.filter((job) => job.area_fit === "non_tech").slice(0, 20).map((job) => ({ id: job.id, title: job.title, company: job.company, reasons: job.area_reasons })),
    groupSamples,
    hiddenSample: hiddenByPreferences.slice(0, 20).map((job) => ({ id: job.id, title: job.title, company: job.company, primary_area: job.primary_area, area_tags: job.area_tags })),
    transitionSample: updates.filter((job) => job.display_tier !== jobs.find((old) => old.id === job.id)?.display_tier).slice(0, 30).map((job) => ({ id: job.id, title: job.title, company: job.company, from: jobs.find((old) => old.id === job.id)?.display_tier, to: job.display_tier, reasons: [...job.validation_reasons, ...job.display_reasons].slice(0, 5) })),
    qualifiedNewsSample: updates.filter((job) => !job.duplicate_of && job.display_tier === "watchlist" && job.candidate_kind === "lead" && ["RSS", "Google Alerts"].includes(job.source)).slice(0, 30).map((job) => ({ id: job.id, title: job.title, company: job.company, target_fit: job.target_fit, location_fit: job.location_fit, reasons: job.display_reasons })),
    newsDecisionSample: updates.filter((job) => ["RSS", "Google Alerts"].includes(job.source) && job.published_at && Date.parse(job.published_at) >= Date.now() - 45 * 24 * 60 * 60 * 1000).slice(0, 100).map((job) => ({ id: job.id, title: job.title, company: job.company, candidate_kind: job.candidate_kind, area_fit: job.area_fit, target_fit: job.target_fit, location_fit: job.location_fit, display_tier: job.display_tier, duplicate_of: job.duplicate_of, reasons: job.display_reasons })),
    visibleSample: updates.filter((job) => !job.duplicate_of && job.display_tier !== "hidden").slice(0, 40).map((job) => ({ id: job.id, title: job.title, company: job.company, candidate_kind: job.candidate_kind, display_tier: job.display_tier, target_fit: job.target_fit, location_fit: job.location_fit })),
    foreignVisibleSample: updates.filter((job) => !job.duplicate_of && job.display_tier !== "hidden" && hasKnownForeignLocation(job)).map((job) => ({ id: job.id, title: job.title, company: job.company, location: job.location, work_mode: job.work_mode, location_fit: job.location_fit })),
  });
  const radarFields = new Set(["display_tier", "target_fit", "location_fit", "display_reasons", "classification_version"]);
  const comparableCoreFields = [
    "candidate_kind", "quality_score", "validation_status", "validation_reasons", "is_active", "canonical_key",
    "identity_key", "last_checked_at", "area_fit", "area_reasons", "match_area", "primary_area", "area_tags",
    "dedup_group_key", "dedup_confidence", "dedup_reasons", "duplicate_of", "status", "verification_level",
  ];
  const changed = (next: Record<string, unknown>, previous: Record<string, unknown>, fields: string[]) =>
    fields.some((field) => JSON.stringify(next[field] ?? null) !== JSON.stringify(previous[field] ?? null));
  const previousById = new Map(jobs.map((job) => [job.id, job]));
  const coreUpdates = updates.filter((job) => changed(job, previousById.get(job.id) || {}, comparableCoreFields)).map((job) => Object.fromEntries(Object.entries(job).filter(([key]) => !radarFields.has(key))));
  for (let index = 0; index < coreUpdates.length; index += 300) {
    const update = await supabase.from("jobs").upsert(coreUpdates.slice(index, index + 300), { onConflict: "id" });
    if (update.error) return NextResponse.json({ error: update.error.message }, { status: 400 });
  }
  const changedDuplicates = [...duplicateOf].filter(([duplicateId, primaryId]) => previousById.get(duplicateId)?.duplicate_of !== primaryId);
  for (let index = 0; index < changedDuplicates.length; index += 10) {
    await Promise.all(changedDuplicates.slice(index, index + 10).map(async ([duplicateId, primaryId]) => {
      const sourceResult = await supabase.from("job_sources").select("source,source_url,external_id,raw_candidate_id,first_seen_at,last_seen_at").eq("job_id", duplicateId);
      if (!sourceResult.error && sourceResult.data?.length) {
        await supabase.from("job_sources").upsert(sourceResult.data.map((source) => ({ ...source, job_id: primaryId })), { onConflict: "job_id,source_url" });
      }
    }));
  }
  const radarPayload = updates.filter((job) => changed(job, previousById.get(job.id) || {}, [...radarFields])).map((job) => ({
      id: job.id,
      display_tier: job.display_tier,
      target_fit: job.target_fit,
      location_fit: job.location_fit,
      display_reasons: job.display_reasons,
      classification_version: job.classification_version,
    }));
  if (radarPayload.length) {
    const radarUpdate = await supabase.rpc("apply_job_radar_classification", { payload: radarPayload });
    if (radarUpdate.error) return NextResponse.json({ error: radarUpdate.error.message, stage: "radar_classification" }, { status: 400 });
  }
  for (const source of sourcesToDisable) {
    await supabase.from("source_registry").update({ enabled: false, last_error: "Desabilitada pelo radar-v2: nenhuma vaga elegível em Brasil/SP" }).eq("id", source.id);
  }
  return NextResponse.json({ ...report, disabledSources: sourcesToDisable.map(({ adapter, identifier, name }) => ({ adapter, identifier, name })) });
}
