import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSupabaseAdmin, hasDatabaseConfig } from "@/lib/supabase";
import type { Job } from "@/lib/types";

export interface DeclinedJob { job: Job; reason: string; declinedAt: string }

export async function getDeclinedJobs(page = 1, pageSize = 20) {
  const user = await requireUser().catch(() => null);
  if (!user) redirect("/login?next=/declined");
  if (!hasDatabaseConfig()) return { jobs: [] as DeclinedJob[], total: 0, page: 1, pageCount: 1, pageSize };
  const safePage = Math.max(1, page);
  const result = await getSupabaseAdmin().from("user_job_decisions")
    .select("reason,created_at,jobs(*)", { count: "exact" }).eq("user_id", user.id).eq("decision", "declined")
    .order("created_at", { ascending: false }).range((safePage - 1) * pageSize, safePage * pageSize - 1);
  if (result.error) throw new Error(result.error.message);
  const jobs = (result.data || []).flatMap((row) => row.jobs ? [{ job: row.jobs as unknown as Job, reason: row.reason, declinedAt: row.created_at }] : []);
  const total = result.count || 0;
  return { jobs, total, page: safePage, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}
