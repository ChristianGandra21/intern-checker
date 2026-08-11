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
  const v11Runs = await db.from("scrape_runs").select("runner,external_run_id,external_url").limit(1);
  const migration009 = !v9Applications.error && !v9Stages.error;
  const migration010 = !v10Decisions.error && !v10Applications.error && !v10Runs.error;
  const migration011 = !v11Runs.error;
  const v12 = await db.from("ingestion_runs").select("persisted_count,review_count,hidden_count,failure_count,duration_ms").limit(1);
  const migration012 = !v12.error;
  const v13Jobs = await db.from("jobs").select("content_changed_at,salary_min,extracted_skills,manual_display_tier").limit(1);
  const v13Notifications = await db.from("notification_events").select("id").limit(1);
  const v13Recommendations = await db.from("application_recommendations").select("id").limit(1);
  const migration013 = !v13Jobs.error && !v13Notifications.error && !v13Recommendations.error;
  const v14 = await db.from("tracked_applications").select("decision_priority_enabled,decision_priority_score,decision_priority_criteria").limit(1);
  const migration014 = !v14.error;
  const v15Applications = await db.from("tracked_applications").select("company_context,company_culture,company_reviews,application_resume_text,candidate_pitch").limit(1);
  const v15Recommendations = await db.from("application_recommendations").select("overall_assessment,company_culture_assessment,pitch_strengths,pitch_improvements,analyzed_resume,analyzed_pitch").limit(1);
  const migration015 = !v15Applications.error && !v15Recommendations.error;
  const ready = !v3.error && !v4.error && !v5.error && !v6.error && !v7.error && !v8.error && migration009 && migration010 && migration011 && migration012 && migration013 && migration014 && migration015;
  return NextResponse.json({ configured: true, migration003: !v3.error, migration004: !v4.error, migration005: !v5.error, migration006: !v6.error, migration007: !v7.error, migration008: !v8.error, migration009, migration010, migration011, migration012, migration013, migration014, migration015, ready }, { status: ready ? 200 : 409 });
}
