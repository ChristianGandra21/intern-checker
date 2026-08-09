import { spawn } from "node:child_process";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const runId = process.env.LOCAL_SCRAPE_RUN_ID;
const projectRoot = process.env.LOCAL_SCRAPE_PROJECT_ROOT;
const apiBase = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
if (!runId || !projectRoot || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) process.exit(2);

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let tail = "";
const remember = (chunk) => { tail = `${tail}${String(chunk)}`.slice(-8000); };
const sanitize = (value) => value
  .replaceAll(process.env.SUPABASE_SERVICE_ROLE_KEY || "__none__", "[segredo removido]")
  .replaceAll(process.env.INGEST_API_KEY || "__none__", "[segredo removido]");

async function update(values) {
  await db.from("scrape_runs").update(values).eq("id", runId);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: projectRoot, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (chunk) => { process.stdout.write(chunk); remember(chunk); });
    child.stderr.on("data", (chunk) => { process.stderr.write(chunk); remember(chunk); });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve(code) : reject(Object.assign(new Error(`Processo finalizado com código ${code ?? -1}.`), { exitCode: code ?? -1 })));
  });
}

try {
  await update({ status: "running", started_at: new Date().toISOString(), error_message: null });
  await run(`${projectRoot}/.venv/bin/intern-checker`, ["run", "--config", "config/sources.yml", "--output", "exports"]);
  const response = await fetch(`${apiBase}/api/jobs/revalidate`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-ingest-key": process.env.INGEST_API_KEY || "" },
    body: JSON.stringify({ check_urls: false }),
  });
  const body = await response.text();
  remember(`\nRevalidação HTTP ${response.status}: ${body}\n`);
  if (!response.ok) throw Object.assign(new Error(`Revalidação falhou com HTTP ${response.status}.`), { exitCode: 1 });
  await db.rpc("purge_expired_tracked_applications");
  await update({ status: "succeeded", finished_at: new Date().toISOString(), exit_code: 0, summary: sanitize(tail).slice(-4000), error_message: null });
} catch (error) {
  const message = error instanceof Error ? error.message : "Falha inesperada na coleta local.";
  remember(`\n${message}\n`);
  await update({ status: "failed", finished_at: new Date().toISOString(), exit_code: Number(error?.exitCode ?? 1), summary: sanitize(tail).slice(-4000), error_message: sanitize(message).slice(0, 1000) });
  process.exitCode = 1;
}
