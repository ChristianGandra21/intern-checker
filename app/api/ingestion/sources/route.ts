import { NextRequest, NextResponse } from "next/server";
import { validIngestKey } from "@/lib/ingest-auth";
import { getSupabaseAdmin, hasDatabaseConfig } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  if (!validIngestKey(request.headers.get("x-ingest-key"))) return NextResponse.json({ error: "Chave inválida." }, { status: 401 });
  if (!hasDatabaseConfig()) return NextResponse.json({ sources: [] });
  const result = await getSupabaseAdmin().from("source_registry").select("name,adapter,identifier,base_url,enabled").eq("enabled", true).order("name");
  if (result.error) return NextResponse.json({ sources: [], warning: "Execute a migration 004." });
  return NextResponse.json({ sources: result.data ?? [] });
}
