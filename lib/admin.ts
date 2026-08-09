import type { User } from "@supabase/supabase-js";

export type ScrapingExecutionMode = "disabled" | "local" | "github";

export function scrapingExecutionMode(): ScrapingExecutionMode {
  const configured = process.env.SCRAPING_EXECUTION_MODE?.trim().toLowerCase();
  if (configured === "local" || configured === "github" || configured === "disabled") return configured;
  return process.env.LOCAL_SCRAPING_ENABLED === "true" ? "local" : "disabled";
}

export function scrapingEnabled() {
  return scrapingExecutionMode() !== "disabled";
}

export function scrapingAdminEmails() {
  return new Set((process.env.SCRAPING_ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLocaleLowerCase("pt-BR"))
    .filter(Boolean));
}

export function isScrapingAdmin(user: Pick<User, "email"> | null | undefined) {
  return Boolean(user?.email && scrapingAdminEmails().has(user.email.toLocaleLowerCase("pt-BR")));
}

export function hasSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
