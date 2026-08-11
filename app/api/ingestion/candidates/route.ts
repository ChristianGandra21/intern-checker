import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { validIngestKey } from "@/lib/ingest-auth";
import { buildDedupIdentity, likelySameOpportunity } from "@/lib/job-identity";
import { classifyDisplay, type DisplayTier } from "@/lib/job-display";
import { extractJobDetails } from "@/lib/job-details";
import { analyzeJobBatch, JOB_AI_MODEL, JOB_PROMPT_VERSION, type JobAiResult } from "@/lib/job-ai";
import { validateJob, type JobValidationInput } from "@/lib/job-validation";
import { getSupabaseAdmin, hasDatabaseConfig } from "@/lib/supabase";
import { normalizeNewsInput } from "@/lib/news-leads";
import { nullableTimestamp, timestampOrNow } from "@/lib/timestamps";

export const runtime = "nodejs";
export const maxDuration = 60;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

function discoveredAts(value: string) {
  try {
    const url = new URL(value);
    const identifier = url.pathname.split("/").filter(Boolean)[0];
    if (!identifier) return null;
    if (/greenhouse\.io$/.test(url.hostname)) return { adapter: "greenhouse", identifier, base_url: `${url.origin}/${identifier}` };
    if (url.hostname === "jobs.lever.co") return { adapter: "lever", identifier, base_url: `${url.origin}/${identifier}` };
    if (url.hostname === "jobs.ashbyhq.com") return { adapter: "ashby", identifier, base_url: `${url.origin}/${identifier}` };
    return null;
  } catch { return null; }
}

function verification(tier: DisplayTier, hasOfficial: boolean) {
  if (tier === "hidden") return "rejected";
  if (tier === "watchlist") return "review";
  return hasOfficial ? "confirmed" : "probable";
}

export async function POST(request: NextRequest) {
  if (!validIngestKey(request.headers.get("x-ingest-key"))) return NextResponse.json({ error: "Chave de ingestão inválida." }, { status: 401 });
  if (!hasDatabaseConfig()) return NextResponse.json({ error: "Banco não configurado." }, { status: 503 });
  const body = await request.json().catch(() => null) as { candidates?: unknown[]; run_id?: unknown; run?: Record<string, unknown> } | null;
  if (!body?.candidates || !Array.isArray(body.candidates) || body.candidates.length > 40) return NextResponse.json({ error: "Envie até 40 candidates." }, { status: 400 });
  const candidates = body.candidates.filter((value): value is Record<string, unknown> => Boolean(value && typeof value === "object"));
  const db = getSupabaseAdmin();
  const seenAt = new Date().toISOString();
  const schema = await db.from("raw_candidates").select("id").limit(1);
  if (schema.error) return NextResponse.json({ error: "Pipeline v2 indisponível. Execute as migrations 003 e 004 no Supabase.", detail: schema.error.message }, { status: 409 });
  const areaSchema = await db.from("jobs").select("area_fit").limit(1);
  if (areaSchema.error) return NextResponse.json({ error: "Filtro de área indisponível. Execute a migration 005 no Supabase.", detail: areaSchema.error.message }, { status: 409 });
  const dedupSchema = await db.from("jobs").select("dedup_group_key,primary_area").limit(1);
  if (dedupSchema.error) return NextResponse.json({ error: "Deduplicação global indisponível. Execute a migration 006 no Supabase.", detail: dedupSchema.error.message }, { status: 409 });
  const radarSchema = await db.from("jobs").select("display_tier,target_fit,location_fit").limit(1);
  if (radarSchema.error) return NextResponse.json({ error: "Radar amplo indisponível. Execute a migration 007 no Supabase.", detail: radarSchema.error.message }, { status: 409 });
  let runId = typeof body.run_id === "string" ? body.run_id : null;
  const legacyRun = !runId && Boolean(body.run);
  if (runId) {
    const run = await db.from("ingestion_runs").select("id,status").eq("id", runId).maybeSingle();
    if (run.error) return NextResponse.json({ error: run.error.message, stage: "ingestion_run" }, { status: 400 });
    if (!run.data) return NextResponse.json({ error: "Execução de ingestão não encontrada." }, { status: 404 });
    if (run.data.status !== "running") return NextResponse.json({ error: `Execução não aceita lotes no estado ${run.data.status}.` }, { status: 409 });
  } else if (body.run) {
    const run = await db.from("ingestion_runs").insert({ status: "running", found_count: body.run.found_count || candidates.length, source_summary: body.run.source_summary || {} }).select("id").single();
    runId = run.data?.id || null;
  }

  const preparedInput = candidates.map((item) => {
    const rawPayload = item.raw_payload && typeof item.raw_payload === "object"
      ? { ...item.raw_payload as Record<string, unknown> }
      : {};
    const invalidDates = ["published_at", "application_deadline", "discovered_at"].filter((field) =>
      item[field] != null && nullableTimestamp(item[field]) === null,
    );
    if (invalidDates.length) rawPayload._invalid_timestamp_fields = invalidDates;
    const input = normalizeNewsInput({
      title: String(item.title || ""), company: String(item.company || "Não informada"), description: String(item.description || ""),
      location: String(item.location || ""), work_mode: String(item.work_mode || "unknown"), source: String(item.source || "Unknown"),
      source_url: String(item.source_url || ""), published_at: nullableTimestamp(item.published_at),
      application_deadline: nullableTimestamp(item.application_deadline),
      source_type: String(item.source_type || "discovery"),
      official_url: typeof item.official_url === "string" ? item.official_url : null,
      application_url: typeof item.application_url === "string" ? item.application_url : null,
      external_id: typeof item.external_id === "string" ? item.external_id : null,
      raw_payload: rawPayload,
    } satisfies JobValidationInput);
    const contentHash = hash(JSON.stringify([input.title, input.company, input.description, input.location, input.source_url, input.application_deadline]));
    const externalId = typeof item.external_id === "string" ? item.external_id : null;
    const dedupKey = hash(`${input.source}|${externalId || input.source_url}|${contentHash}`);
    return { item, input, contentHash, dedupKey, externalId, base: validateJob(input) };
  }).filter(({ input }) => input.title.length >= 2 && /^https?:/.test(input.source_url));
  const prepared = [...new Map(preparedInput.map((item) => [item.dedupKey, item])).values()];

  const discoveries = new Map<string, { found: NonNullable<ReturnType<typeof discoveredAts>>; qualified: boolean }>();
  for (const candidate of prepared) {
    const found = discoveredAts(String(candidate.item.official_url || candidate.input.source_url));
    if (found) {
      const key = `${found.adapter}:${found.identifier}`;
      const qualified = candidate.base.candidate_kind === "job"
        && ["tech", "general"].includes(candidate.base.area_fit)
        && ["confirmed", "probable"].includes(candidate.base.location_fit)
        && candidate.base.target_fit !== "incompatible"
        && candidate.base.display_tier !== "hidden";
      const previous = discoveries.get(key);
      discoveries.set(key, { found, qualified: Boolean(previous?.qualified || qualified) });
    }
  }
  for (const { found, qualified } of discoveries.values()) {
    if (!qualified) continue;
    const current = await db.from("source_registry").select("id,successful_probes").eq("adapter", found.adapter).eq("identifier", found.identifier).maybeSingle();
    if (current.data) {
      const probes = current.data.successful_probes + 1;
      await db.from("source_registry").update({ successful_probes: probes, enabled: probes >= 2, last_success_at: new Date().toISOString(), last_error: null }).eq("id", current.data.id);
    } else {
      await db.from("source_registry").insert({ name: found.identifier, ...found, origin: "discovered", successful_probes: 1, enabled: false, last_success_at: new Date().toISOString() });
    }
  }

  const hashes = [...new Set(prepared.map((item) => item.contentHash))];
  const cached = hashes.length ? await db.from("ai_analysis_cache").select("content_hash,result").eq("prompt_version", JOB_PROMPT_VERSION).eq("model", JOB_AI_MODEL).in("content_hash", hashes) : { data: [], error: null };
  const aiByHash = new Map((cached.data ?? []).map((row) => [row.content_hash, row.result as JobAiResult]));
  const previousAttempts = hashes.length
    ? await db.from("jobs").select("content_hash,ai_status,ai_error,ai_last_attempt_at").in("content_hash", hashes)
    : { data: [], error: null };
  const attemptByHash = new Map((previousAttempts.data ?? []).map((row) => [row.content_hash, row]));
  const retryAfter = Date.now() - 24 * 60 * 60 * 1000;
  const retryBlocked = new Set((previousAttempts.data ?? []).filter((row) => row.ai_status === "failed" && row.ai_last_attempt_at && Date.parse(row.ai_last_attempt_at) > retryAfter).map((row) => row.content_hash));
  const eligibleForAi = prepared.filter((item) => item.base.candidate_kind !== "noise"
    && (item.base.area_fit === "ambiguous" || item.base.target_fit === "unknown" || item.base.location_fit === "unknown"));
  const missing = [...new Map(
    eligibleForAi.filter((item) => !aiByHash.has(item.contentHash) && !retryBlocked.has(item.contentHash)).map((item) => [item.contentHash, item]),
  ).values()];
  let aiWarning: string | null = null;
  const attemptedHashes = new Set<string>();
  const failedHashes = new Set<string>();
  const aiErrorByHash = new Map<string, string>();
  for (let index = 0; index < missing.length; index += 8) {
    const batch = missing.slice(index, index + 8);
    batch.forEach((item) => attemptedHashes.add(item.contentHash));
    try {
      const results = await analyzeJobBatch(batch.map((item) => item.input));
      const cacheRows = batch.map((item, offset) => ({ content_hash: item.contentHash, prompt_version: JOB_PROMPT_VERSION, model: JOB_AI_MODEL, result: results.find((result) => result.index === offset) || null })).filter((row) => row.result);
      cacheRows.forEach((row) => aiByHash.set(row.content_hash, row.result!));
      if (cacheRows.length) await db.from("ai_analysis_cache").upsert(cacheRows, { onConflict: "content_hash,prompt_version,model" });
    } catch (error) {
      aiWarning = error instanceof Error ? error.message : "Falha Groq";
      batch.forEach((item) => { failedHashes.add(item.contentHash); aiErrorByHash.set(item.contentHash, aiWarning!); });
      break;
    }
  }

  const rawRows = [...new Map(prepared.map(({ item, input, contentHash, dedupKey, externalId }) => [dedupKey, {
    run_id: runId,
    source: input.source, source_type: String(item.source_type || "discovery"), external_id: externalId,
    source_url: input.source_url, title: input.title, snippet: input.description, raw_payload: input.raw_payload || {},
    content_hash: contentHash, dedup_key: dedupKey, state: item.official_url ? "resolved" : "discovered",
    official_url: item.official_url || null, application_url: item.application_url || null,
  }])).values()];
  const rawResult = await db.from("raw_candidates").upsert(rawRows, { onConflict: "dedup_key" }).select("id,dedup_key");
  if (rawResult.error) return NextResponse.json({ error: rawResult.error.message, stage: "raw_candidates" }, { status: 400 });
  const rawByKey = new Map((rawResult.data ?? []).map((row) => [row.dedup_key, row.id]));

  const jobs = prepared.map(({ item, input, contentHash, dedupKey, externalId, base }) => {
    const ai = aiByHash.get(contentHash) || null;
    const official = String(item.official_url || item.application_url || "");
    const areaFit = base.area_fit === "ambiguous" && ai ? ai.area_fit : base.area_fit;
    const areaReasons = base.area_fit === "ambiguous" && ai
      ? [...base.area_reasons, ...ai.evidence.map((value) => `Groq: ${value}`)]
      : base.area_reasons;
    const title = ai?.title || input.title;
    const company = ai?.company || input.company;
    const displayInput = { ...input, title, company };
    const display = classifyDisplay(displayInput, { ...base, area_fit: areaFit }, ai);
    const identity = buildDedupIdentity({ ...input, title, company, external_id: externalId });
    const persistedRawPayload = { ...input.raw_payload };
    if (ai?.application_deadline && nullableTimestamp(ai.application_deadline) === null) {
      persistedRawPayload._invalid_ai_application_deadline = ai.application_deadline;
    }
    const details = extractJobDetails({ title, description: input.description }, ai);
    return {
      title, company, description: input.description, location: input.location,
      work_mode: ai && ai.work_mode !== "unknown" ? ai.work_mode : input.work_mode, source: input.source, source_url: official || input.source_url,
      official_url: input.official_url, application_url: input.application_url, external_id: externalId,
      published_at: input.published_at, discovered_at: timestampOrNow(item.discovered_at), score: Number(item.score || 0),
      score_reasons: item.score_reasons || [], match_location: Boolean(item.match_location), match_start: Boolean(item.match_start),
      fingerprint: String(item.fingerprint || hash(`${input.title}|${input.company}|${input.location}`)), raw_payload: persistedRawPayload,
      ...base, content_hash: contentHash,
      match_area: areaFit === "tech", area_fit: areaFit, area_reasons: areaReasons,
      primary_area: base.primary_area, area_tags: base.area_tags,
      dedup_group_key: identity.key, dedup_confidence: identity.confidence, dedup_reasons: identity.reasons,
      ...display,
      validation_status: display.display_tier === "strong" ? "accepted" : display.display_tier === "watchlist" ? "review" : "rejected",
      ai_status: ai ? "completed" : failedHashes.has(contentHash) || retryBlocked.has(contentHash) ? "failed" : attemptedHashes.has(contentHash) ? "pending" : eligibleForAi.some((entry) => entry.contentHash === contentHash) ? "pending" : "skipped",
      ai_error: ai ? null : aiErrorByHash.get(contentHash) || attemptByHash.get(contentHash)?.ai_error || null,
      ai_last_attempt_at: attemptedHashes.has(contentHash) ? new Date().toISOString() : attemptByHash.get(contentHash)?.ai_last_attempt_at || null,
      ai_result: ai || {},
      application_deadline: nullableTimestamp(ai?.application_deadline) || input.application_deadline,
      ...details,
      verification_level: verification(display.display_tier, Boolean(official)), first_seen_at: seenAt,
      last_seen_at: seenAt, content_changed_at: seenAt, missing_runs: 0,
      manual_display_tier: null as DisplayTier | null,
      manual_candidate_kind: null as "job" | "lead" | "noise" | null,
      manual_fields: {} as Record<string, unknown>, moderated_at: null as string | null,
      _raw_id: rawByKey.get(dedupKey),
      _source_url: input.source_url,
      _identity_input: { ...input, title, company, external_id: externalId },
      _canonical_group: identity.key,
    };
  });

  const trustRank = (job: { official_url?: string | null; verification_level?: string; source: string }) =>
    (job.official_url ? 100_000 : 0)
    + (job.verification_level === "confirmed" ? 10_000 : job.verification_level === "probable" ? 5_000 : 0)
    + (job.source === "Planilha comunitária" ? 1_000 : job.source === "RSS" ? 100 : 500);
  const rank = (job: (typeof jobs)[number]) => trustRank(job) + job.description.length;
  const groups: Array<{ key: string; primary: (typeof jobs)[number]; members: (typeof jobs)[number][] }> = [];
  for (const job of jobs) {
    let matched: ReturnType<typeof likelySameOpportunity> | null = null;
    let group: (typeof groups)[number] | undefined;
    for (const candidate of groups) {
      if (candidate.key === job.dedup_group_key) {
        group = candidate;
        break;
      }
      const comparison = likelySameOpportunity(candidate.primary._identity_input, job._identity_input);
      if (comparison.same) {
        group = candidate;
        matched = comparison;
        break;
      }
    }
    if (!group) groups.push({ key: job.dedup_group_key, primary: job, members: [job] });
    else {
      group.members.push(job);
      job._canonical_group = group.key;
      if (matched) {
        job.dedup_confidence = matched.confidence;
        job.dedup_reasons = [...new Set([...job.dedup_reasons, matched.reason])];
      }
      if (rank(job) > rank(group.primary)) group.primary = job;
    }
  }
  const canonicalJobs = groups.map((group) => {
    group.members.forEach((member) => { member._canonical_group = group.key; });
    group.primary.dedup_group_key = group.key;
    if (group.members.length > 1) {
      group.primary.dedup_confidence = Math.max(80, group.primary.dedup_confidence);
      group.primary.dedup_reasons = [...new Set([...group.primary.dedup_reasons, "similaridade protegida entre múltiplas fontes"])];
    }
    return group.primary;
  });
  const existingResult = canonicalJobs.length
    ? await db.from("jobs").select("id,fingerprint,dedup_group_key,official_url,application_url,external_id,verification_level,source,source_url,title,company,description,location,content_hash,first_seen_at,last_seen_at,content_changed_at,discovered_at,manual_display_tier,manual_candidate_kind,manual_fields,moderated_at").is("duplicate_of", null).limit(5000)
    : { data: [], error: null };
  if (existingResult.error) return NextResponse.json({ error: existingResult.error.message, stage: "jobs_lookup" }, { status: 400 });
  const existingByGroup = new Map((existingResult.data ?? []).filter((job) => job.dedup_group_key).map((job) => [job.dedup_group_key, job]));
  const existingCanonicalGroups = new Set<string>();
  canonicalJobs.forEach((job) => {
    const existing = existingByGroup.get(job.dedup_group_key) || (existingResult.data ?? []).find((row) => likelySameOpportunity(row, job._identity_input).same);
    if (existing) {
      const previousGroup = job.dedup_group_key;
      job.dedup_group_key = existing.dedup_group_key || job.dedup_group_key;
      job._canonical_group = job.dedup_group_key;
      jobs.filter((member) => member._canonical_group === previousGroup).forEach((member) => { member._canonical_group = job.dedup_group_key; });
      job.fingerprint = existing.fingerprint;
      existingByGroup.set(job.dedup_group_key, existing);
      existingCanonicalGroups.add(job.dedup_group_key);
      job.first_seen_at = existing.first_seen_at || existing.discovered_at || seenAt;
      job.discovered_at = existing.discovered_at || job.first_seen_at;
      job.content_changed_at = existing.content_hash && existing.content_hash === job.content_hash
        ? existing.content_changed_at || job.first_seen_at
        : seenAt;
      job.manual_display_tier = existing.manual_display_tier;
      job.manual_candidate_kind = existing.manual_candidate_kind;
      job.manual_fields = existing.manual_fields || {};
      job.moderated_at = existing.moderated_at;
      const corrected = existing.manual_fields && typeof existing.manual_fields === "object"
        ? existing.manual_fields as Record<string, unknown>
        : {};
      for (const field of ["title", "company", "location", "work_mode", "application_deadline", "target_fit", "location_fit"] as const) {
        if (corrected[field] !== undefined) (job as Record<string, unknown>)[field] = corrected[field];
      }
      if (existing.manual_display_tier) {
        job.display_tier = existing.manual_display_tier;
        job.validation_status = existing.manual_display_tier === "strong" ? "accepted" : existing.manual_display_tier === "watchlist" ? "review" : "rejected";
        job.verification_level = verification(existing.manual_display_tier, Boolean(job.official_url || job.application_url));
        job.display_reasons = ["classificação administrativa", ...job.display_reasons.filter((reason) => reason !== "classificação administrativa")];
      }
      if (existing.manual_candidate_kind) job.candidate_kind = existing.manual_candidate_kind;
    }
  });
  const jobsToPersist = canonicalJobs.filter((job) => {
    const existing = existingByGroup.get(job.dedup_group_key);
    return !existing || trustRank(job) >= trustRank(existing);
  });
  const uniqueJobsToPersist = [...jobsToPersist.reduce((byFingerprint, job) => {
    const current = byFingerprint.get(job.fingerprint);
    if (!current || rank(job) > rank(current)) byFingerprint.set(job.fingerprint, job);
    return byFingerprint;
  }, new Map<string, (typeof jobs)[number]>()).values()];
  const persistedRows = uniqueJobsToPersist.map((job) => Object.fromEntries(
    Object.entries(job).filter(([key]) => !["_raw_id", "_source_url", "_identity_input", "_canonical_group"].includes(key)),
  ));
  const persistedFingerprints = new Set(uniqueJobsToPersist.map((job) => job.fingerprint));
  const persisted = persistedRows.length
    ? await db.from("jobs").upsert(persistedRows, { onConflict: "fingerprint" }).select("id,fingerprint")
    : { data: [], error: null };
  if (persisted.error) return NextResponse.json({ error: persisted.error.message, stage: "jobs" }, { status: 400 });
  const seenExistingIds = [...new Set(canonicalJobs
    .map((job) => existingByGroup.get(job.dedup_group_key)?.id)
    .filter((id): id is string => Boolean(id)))];
  if (seenExistingIds.length) {
    const touched = await db.from("jobs").update({ last_seen_at: seenAt, missing_runs: 0 }).in("id", seenExistingIds);
    if (touched.error) return NextResponse.json({ error: touched.error.message, stage: "jobs_last_seen" }, { status: 400 });
  }
  const jobByFingerprint = new Map([
    ...(existingResult.data ?? []).map((row) => [row.fingerprint, row.id] as const),
    ...(persisted.data ?? []).map((row) => [row.fingerprint, row.id] as const),
  ]);
  const fingerprintByGroup = new Map(canonicalJobs.map((job) => [job.dedup_group_key, job.fingerprint]));
  const sourceMap = new Map<string, { job_id: string; raw_candidate_id: string | undefined; source: string; source_url: string; external_id: string | null; last_seen_at: string }>();
  for (const job of jobs) {
    const jobId = jobByFingerprint.get(fingerprintByGroup.get(job._canonical_group) || job.fingerprint);
    if (!jobId) continue;
    const row = { job_id: jobId, raw_candidate_id: job._raw_id, source: job.source, source_url: job._source_url, external_id: job.external_id, last_seen_at: new Date().toISOString() };
    sourceMap.set(`${jobId}|${job._source_url}`, row);
  }
  const sources = [...sourceMap.values()];
  if (sources.length) {
    const sourceResult = await db.from("job_sources").upsert(sources, { onConflict: "job_id,source_url" });
    if (sourceResult.error) return NextResponse.json({ error: sourceResult.error.message, stage: "job_sources" }, { status: 400 });
  }
  if (runId && legacyRun) {
    const summary = (body.run?.source_summary || {}) as Record<string, unknown>;
    const sourceRows = Object.entries(summary).map(([source, count]) => ({ ingestion_run_id: runId, source, adapter: source.toLowerCase().replaceAll(" ", "_"), status: "success", discovered_count: Number(count) || 0, resolved_count: prepared.filter((item) => item.input.source === source && item.item.official_url).length, accepted_count: jobs.filter((job) => job.source === source && job.display_tier === "strong").length, finished_at: new Date().toISOString() }));
    if (sourceRows.length) await db.from("source_runs").insert(sourceRows);
    await db.from("ingestion_runs").update({ status: "success", accepted_count: jobs.filter((job) => job.display_tier === "strong").length, finished_at: new Date().toISOString() }).eq("id", runId);
    const snapshots = Array.isArray(body.run?.official_snapshots) ? body.run.official_snapshots : [];
    for (const rawSnapshot of snapshots) {
      const snapshot = rawSnapshot as { adapter?: unknown; identifier?: unknown; external_ids?: unknown };
      if (typeof snapshot.adapter !== "string" || typeof snapshot.identifier !== "string" || !Array.isArray(snapshot.external_ids)) continue;
      const seen = new Set(snapshot.external_ids.filter((id): id is string => typeof id === "string"));
      const sourceName = snapshot.adapter[0].toUpperCase() + snapshot.adapter.slice(1);
      const existing = await db.from("jobs").select("id,external_id,missing_runs").eq("source", sourceName).contains("raw_payload", { _registry_identifier: snapshot.identifier }).eq("is_active", true);
      for (const oldJob of existing.data ?? []) {
        if (oldJob.external_id && seen.has(oldJob.external_id)) continue;
        const missingRuns = Number(oldJob.missing_runs || 0) + 1;
        await db.from("jobs").update(missingRuns >= 2
          ? { missing_runs: missingRuns, is_active: false, verification_level: "rejected", validation_status: "rejected" }
          : { missing_runs: missingRuns }).eq("id", oldJob.id);
      }
    }
  }
  const newStrongGroups = new Set(canonicalJobs.filter((job) => job.display_tier === "strong" && !existingCanonicalGroups.has(job.dedup_group_key)).map((job) => job.dedup_group_key));
  const newStrongSourceUrls = jobs.filter((job) => job.display_tier === "strong" && newStrongGroups.has(job._canonical_group)).map((job) => job._source_url);
  const outcomes = jobs.map((job) => {
    const rawPayload = job.raw_payload as Record<string, unknown>;
    const canonicalFingerprint = fingerprintByGroup.get(job._canonical_group) || job.fingerprint;
    const resolutionFailed = Boolean(rawPayload._enrichment_timeout)
      || [400, 401, 403, 404, 410, 429].includes(Number(rawPayload.official_http_status ?? rawPayload.http_status));
    const analysisFailed = failedHashes.has(job.content_hash) || retryBlocked.has(job.content_hash);
    return {
      source_url: job._source_url,
      canonical_fingerprint: canonicalFingerprint,
      persisted: persistedFingerprints.has(canonicalFingerprint),
      candidate_kind: job.candidate_kind,
      validation_status: job.validation_status,
      display_tier: job.display_tier,
      display_reasons: job.display_reasons,
      resolution_failed: resolutionFailed,
      analysis_failed: analysisFailed,
      failed: resolutionFailed || analysisFailed,
      created: !existingCanonicalGroups.has(job._canonical_group),
      updated: existingCanonicalGroups.has(job._canonical_group),
      duplicate: canonicalFingerprint !== job.fingerprint,
    };
  });
  return NextResponse.json({
    received: candidates.length,
    persisted: persistedRows.length,
    accepted: outcomes.filter((item) => item.display_tier === "strong").length,
    review: outcomes.filter((item) => item.display_tier === "watchlist").length,
    rejected: outcomes.filter((item) => item.validation_status === "rejected").length,
    hidden: outcomes.filter((item) => item.display_tier === "hidden").length,
    failures: outcomes.filter((item) => item.failed).length,
    resolved: prepared.filter((item) => item.item.official_url || item.item.application_url).length,
    created: canonicalJobs.filter((job) => !existingCanonicalGroups.has(job.dedup_group_key)).length,
    updated: canonicalJobs.filter((job) => existingCanonicalGroups.has(job.dedup_group_key)).length,
    duplicates: Math.max(0, jobs.length - canonicalJobs.length),
    cachedAi: eligibleForAi.length - missing.length, aiWarning, outcomes,
    newStrongSourceUrls: [...new Set(newStrongSourceUrls)],
  }, { status: 201 });
}
