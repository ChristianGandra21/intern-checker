import { NextRequest, NextResponse } from "next/server";
import { hasSameOrigin } from "@/lib/admin";
import { getOptionalUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getOptionalUser();
  if (!user) return NextResponse.json({ error: "Faça login para restaurar a vaga." }, { status: 401 });
  if (!hasSameOrigin(request)) return NextResponse.json({ error: "Origem da requisição inválida." }, { status: 403 });
  const { id } = await context.params;
  const result = await getSupabaseAdmin().from("tracked_applications").update({ deleted_at: null })
    .eq("id", id).eq("user_id", user.id).not("deleted_at", "is", null).select("id").maybeSingle();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  if (!result.data) return NextResponse.json({ error: "Vaga não encontrada na lixeira." }, { status: 404 });
  return NextResponse.json({ restored: true });
}
