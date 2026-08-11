import { NextRequest, NextResponse } from "next/server";
import { hasSameOrigin } from "@/lib/admin";
import { getOptionalUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getOptionalUser();
  if (!user) return NextResponse.json({ error: "Faça login." }, { status: 401 });
  if (!hasSameOrigin(request)) return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  const { id } = await context.params;
  const result = await getSupabaseAdmin().from("saved_searches").delete().eq("id", id).eq("user_id", user.id);
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  return NextResponse.json({ deleted: true });
}
