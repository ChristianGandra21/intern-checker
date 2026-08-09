import { NextRequest, NextResponse } from "next/server";
import { validIngestKey } from "@/lib/ingest-auth";
import { hasDatabaseConfig } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  if (!validIngestKey(request.headers.get("x-ingest-key"))) return NextResponse.json({ error: "Chave de ingestão inválida." }, { status: 401 });
  if (!hasDatabaseConfig()) return NextResponse.json({ excluded_area_categories: [], excluded_area_terms: [] });
  return NextResponse.json({
    excluded_area_categories: [],
    excluded_area_terms: [],
    note: "Preferências agora são pessoais e aplicadas nas saídas autenticadas; a ingestão preserva todas as vagas.",
  });
}
