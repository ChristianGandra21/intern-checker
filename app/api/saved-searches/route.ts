import { NextRequest, NextResponse } from "next/server";
import { hasSameOrigin } from "@/lib/admin";
import { getOptionalUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const user = await getOptionalUser();
  if (!user) return NextResponse.json({ error: "Faça login para salvar uma busca." }, { status: 401 });
  if (!hasSameOrigin(request)) return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  const body = await request.json().catch(() => null) as { name?: unknown; filters?: unknown; notify?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 100) : "";
  if (!name || !body?.filters || typeof body.filters !== "object") return NextResponse.json({ error: "Nome e filtros são obrigatórios." }, { status: 400 });
  const result = await getSupabaseAdmin().from("saved_searches").insert({ user_id: user.id, name, filters: body.filters, notify: body.notify !== false }).select("*").single();
  if (result.error) return NextResponse.json({ error: result.error.message, hint: "Execute a migration 013." }, { status: 400 });
  return NextResponse.json({ search: result.data }, { status: 201 });
}
