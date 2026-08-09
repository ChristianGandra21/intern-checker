import { openSync, closeSync } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { NextRequest, NextResponse } from "next/server";
import { hasSameOrigin, isScrapingAdmin, scrapingExecutionMode } from "@/lib/admin";
import { getOptionalUser } from "@/lib/auth";
import { dispatchGithubScrape, expireStaleScrapeRuns, githubScrapingConfigurationError } from "@/lib/scraping";
import { getSupabaseAdmin, hasDatabaseConfig } from "@/lib/supabase";

export const runtime = "nodejs";

async function authorize() {
  const user = await getOptionalUser();
  if (!user) return { error: NextResponse.json({ error: "Faça login para acessar a coleta." }, { status: 401 }) };
  if (!isScrapingAdmin(user)) return { error: NextResponse.json({ error: "A coleta manual é restrita a administradores." }, { status: 403 }) };
  if (!hasDatabaseConfig()) return { error: NextResponse.json({ error: "Banco não configurado." }, { status: 503 }) };
  return { user };
}

export async function GET() {
  const auth = await authorize();
  if (auth.error) return auth.error;
  const db = getSupabaseAdmin();
  await expireStaleScrapeRuns(db);
  const result = await db.from("scrape_runs").select("*").order("requested_at", { ascending: false }).limit(20);
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  const mode = scrapingExecutionMode();
  return NextResponse.json({ runs: result.data || [], enabled: mode !== "disabled", mode });
}

export async function POST(request: NextRequest) {
  const auth = await authorize();
  if (auth.error) return auth.error;
  if (!hasSameOrigin(request)) return NextResponse.json({ error: "Origem da requisição inválida." }, { status: 403 });
  const mode = scrapingExecutionMode();
  if (mode === "disabled") return NextResponse.json({ error: "Defina SCRAPING_EXECUTION_MODE como local ou github para habilitar a coleta." }, { status: 503 });

  const root = process.cwd();
  const collector = path.join(root, ".venv", "bin", "intern-checker");
  const runner = path.join(root, "scripts", "local-scrape-runner.mjs");
  if (mode === "local") {
    try { await Promise.all([access(collector), access(runner)]); }
    catch { return NextResponse.json({ error: "Coletor local indisponível. Crie a .venv e instale collector[dev]." }, { status: 503 }); }
  } else {
    const configurationError = githubScrapingConfigurationError();
    if (configurationError) return NextResponse.json({ error: configurationError }, { status: 503 });
  }

  const db = getSupabaseAdmin();
  await expireStaleScrapeRuns(db);
  const latest = await db.from("scrape_runs").select("requested_at,status").order("requested_at", { ascending: false }).limit(1).maybeSingle();
  if (latest.data?.status === "queued" || latest.data?.status === "running") return NextResponse.json({ error: "Já existe uma coleta em andamento." }, { status: 409 });
  if (latest.data && Date.now() - Date.parse(latest.data.requested_at) < 30 * 60 * 1000) return NextResponse.json({ error: "Aguarde 30 minutos entre coletas manuais." }, { status: 429 });

  const inserted = await db.from("scrape_runs").insert({ requested_by: auth.user.id, status: "queued", runner: mode }).select("*").single();
  if (inserted.error) {
    const concurrent = /scrape_runs_one_active_idx|duplicate key/i.test(inserted.error.message);
    return NextResponse.json({ error: concurrent ? "Já existe uma coleta em andamento." : inserted.error.message }, { status: concurrent ? 409 : 400 });
  }

  if (mode === "github") {
    try {
      await dispatchGithubScrape(inserted.data.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível disparar o GitHub Actions.";
      await db.from("scrape_runs").update({ status: "failed", finished_at: new Date().toISOString(), exit_code: 1, error_message: message.slice(0, 1000) }).eq("id", inserted.data.id);
      return NextResponse.json({ error: message }, { status: 502 });
    }
  } else {
    const logDir = path.join(root, "var", "runs");
    await mkdir(logDir, { recursive: true, mode: 0o700 });
    const descriptor = openSync(path.join(logDir, `${inserted.data.id}.log`), "a", 0o600);
    try {
      const child = spawn(process.execPath, [runner], {
        cwd: root,
        detached: true,
        stdio: ["ignore", descriptor, descriptor],
        env: { ...process.env, LOCAL_SCRAPE_RUN_ID: inserted.data.id, LOCAL_SCRAPE_PROJECT_ROOT: root },
      });
      child.unref();
    } catch (error) {
      await db.from("scrape_runs").update({ status: "failed", finished_at: new Date().toISOString(), exit_code: 1, error_message: error instanceof Error ? error.message : "Não foi possível iniciar o processo." }).eq("id", inserted.data.id);
      return NextResponse.json({ error: "Não foi possível iniciar o coletor local." }, { status: 500 });
    } finally {
      closeSync(descriptor);
    }
  }
  return NextResponse.json({ run: inserted.data }, { status: 202 });
}
