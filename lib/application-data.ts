import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSupabaseAdmin, hasDatabaseConfig } from "@/lib/supabase";
import type { TrackedApplication } from "@/lib/types";

const applicationSelect = "*,application_stages(*),application_recommendations(*),jobs(source)";

function normalizeApplication(row: TrackedApplication): TrackedApplication {
  return {
    ...row,
    application_stages: [...(row.application_stages || [])].sort((a, b) => a.position - b.position),
    application_recommendations: [...(row.application_recommendations || [])].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
  };
}

export async function getApplications(view: "active" | "trash" = "active") {
  const user = await requireUser().catch(() => null);
  if (!user) redirect("/login?next=/applications");
  if (!hasDatabaseConfig()) return [] as TrackedApplication[];
  const db = getSupabaseAdmin();
  if (view === "trash") await db.rpc("purge_expired_tracked_applications");
  let query = db.from("tracked_applications").select(applicationSelect)
    .eq("user_id", user.id).neq("status", "archived");
  query = view === "trash" ? query.not("deleted_at", "is", null) : query.is("deleted_at", null);
  const result = await query.order(view === "trash" ? "deleted_at" : "updated_at", { ascending: false });
  if (result.error) throw new Error(result.error.message);
  return ((result.data || []) as TrackedApplication[]).map(normalizeApplication);
}

export async function getApplication(id: string) {
  const user = await requireUser().catch(() => null);
  if (!user) redirect(`/login?next=/applications/${encodeURIComponent(id)}`);
  if (!hasDatabaseConfig()) return null;
  const result = await getSupabaseAdmin().from("tracked_applications").select(applicationSelect)
    .eq("id", id).eq("user_id", user.id).is("deleted_at", null).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data ? normalizeApplication(result.data as TrackedApplication) : null;
}
