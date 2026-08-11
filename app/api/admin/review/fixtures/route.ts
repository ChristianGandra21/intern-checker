import { NextResponse } from "next/server";
import { isScrapingAdmin } from "@/lib/admin";
import { getOptionalUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const user = await getOptionalUser();
  if (!user) return NextResponse.json({ error: "Faça login." }, { status: 401 });
  if (!isScrapingAdmin(user)) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  const result = await getSupabaseAdmin().from("job_moderations").select("job_id,identity_key,override_display_tier,override_candidate_kind,corrected_fields,reason,created_at,updated_at,jobs(title,company,description,location,work_mode,source,source_url,display_tier,candidate_kind,target_fit,location_fit)").order("updated_at", { ascending: false });
  if (result.error) return NextResponse.json({ error: result.error.message, hint: "Execute a migration 013." }, { status: 400 });
  return new NextResponse(JSON.stringify({ version: "moderation-regression-v1", exported_at: new Date().toISOString(), fixtures: result.data || [] }, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", "content-disposition": 'attachment; filename="moderation-regression.json"', "cache-control": "no-store" },
  });
}
