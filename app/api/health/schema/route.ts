import { NextResponse } from "next/server";
import { getSupabaseAdmin, hasDatabaseConfig } from "@/lib/supabase";

export async function GET() {
  if (!hasDatabaseConfig()) return NextResponse.json({ configured: false, ready: false }, { status: 503 });
  const db = getSupabaseAdmin();
  const v3 = await db.from("jobs").select("validation_status").limit(1);
  const v4 = await db.from("raw_candidates").select("id").limit(1);
  const v5 = await db.from("jobs").select("area_fit").limit(1);
  const v6 = await db.from("jobs").select("dedup_group_key,primary_area").limit(1);
  const v7 = await db.from("jobs").select("display_tier,target_fit,location_fit").limit(1);
  const v8 = await db.from("tracked_applications").select("id").limit(1);
  const v9Applications = await db.from("tracked_applications").select("application_state").limit(1);
  const v9Stages = await db.from("application_stages").select("milestone").limit(1);
  const v10Decisions = await db.from("user_job_decisions").select("job_id").limit(1);
  const v10Applications = await db.from("tracked_applications").select("deleted_at").limit(1);
  const v10Runs = await db.from("scrape_runs").select("status").limit(1);
  const migration009 = !v9Applications.error && !v9Stages.error;
  const migration010 = !v10Decisions.error && !v10Applications.error && !v10Runs.error;
  const ready = !v3.error && !v4.error && !v5.error && !v6.error && !v7.error && !v8.error && migration009 && migration010;
  return NextResponse.json({ configured: true, migration003: !v3.error, migration004: !v4.error, migration005: !v5.error, migration006: !v6.error, migration007: !v7.error, migration008: !v8.error, migration009, migration010, ready }, { status: ready ? 200 : 409 });
}
