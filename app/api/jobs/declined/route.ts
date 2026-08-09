import { NextRequest, NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { getSupabaseAdmin, hasDatabaseConfig } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const user = await getOptionalUser();
  if (!user) return NextResponse.json({ error: "Faça login para ver vagas dispensadas." }, { status: 401 });
  if (!hasDatabaseConfig()) return NextResponse.json({ error: "Banco não configurado." }, { status: 503 });
  const pageSize = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get("page_size")) || 20));
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page")) || 1);
  const result = await getSupabaseAdmin().from("user_job_decisions")
    .select("job_id,reason,created_at,jobs(*)", { count: "exact" })
    .eq("user_id", user.id).eq("decision", "declined")
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  const total = result.count || 0;
  return NextResponse.json({ decisions: result.data || [], total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) });
}
