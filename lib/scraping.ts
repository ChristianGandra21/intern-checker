import type { SupabaseClient } from "@supabase/supabase-js";

const QUEUED_TIMEOUT_MS = 10 * 60 * 1000;
const RUNNING_TIMEOUT_MS = 45 * 60 * 1000;

export async function expireStaleScrapeRuns(db: SupabaseClient) {
  const now = new Date();
  const finishedAt = now.toISOString();
  await Promise.all([
    db.from("scrape_runs").update({
      status: "failed",
      finished_at: finishedAt,
      exit_code: 1,
      error_message: "A execução não saiu da fila em até 10 minutos.",
    }).eq("status", "queued").lt("requested_at", new Date(now.getTime() - QUEUED_TIMEOUT_MS).toISOString()),
    db.from("scrape_runs").update({
      status: "failed",
      finished_at: finishedAt,
      exit_code: 1,
      error_message: "A execução excedeu o limite de 45 minutos.",
    }).eq("status", "running").lt("started_at", new Date(now.getTime() - RUNNING_TIMEOUT_MS).toISOString()),
  ]);
}

function githubConfig() {
  return {
    token: process.env.GITHUB_ACTIONS_TOKEN || "",
    repository: process.env.GITHUB_REPOSITORY || "",
    workflow: process.env.GITHUB_WORKFLOW_FILE || "daily-search.yml",
    ref: process.env.GITHUB_WORKFLOW_REF || "main",
  };
}

export function githubScrapingConfigurationError() {
  const config = githubConfig();
  if (!config.token) return "GITHUB_ACTIONS_TOKEN não configurado.";
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(config.repository)) return "GITHUB_REPOSITORY deve usar o formato owner/repository.";
  if (!config.workflow.trim()) return "GITHUB_WORKFLOW_FILE não configurado.";
  if (!config.ref.trim()) return "GITHUB_WORKFLOW_REF não configurado.";
  return null;
}

export async function dispatchGithubScrape(runId: string) {
  const config = githubConfig();
  const configurationError = githubScrapingConfigurationError();
  if (configurationError) throw new Error(configurationError);
  const endpoint = `https://api.github.com/repos/${config.repository}/actions/workflows/${encodeURIComponent(config.workflow)}/dispatches`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
    },
    body: JSON.stringify({ ref: config.ref, inputs: { scrape_run_id: runId } }),
    cache: "no-store",
  });
  if (response.status !== 204) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`GitHub Actions recusou o disparo (HTTP ${response.status})${detail ? `: ${detail}` : "."}`);
  }
}
