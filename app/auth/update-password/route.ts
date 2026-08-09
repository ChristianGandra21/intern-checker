import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const password = String(form.get("password") || "");
  const confirmation = String(form.get("confirmation") || "");
  const destination = new URL("/reset-password", request.nextUrl.origin);
  if (password.length < 8 || password !== confirmation) {
    destination.searchParams.set("error", "As senhas devem coincidir e ter pelo menos 8 caracteres.");
    return NextResponse.redirect(destination, 303);
  }
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return NextResponse.redirect(new URL("/forgot-password?error=O+link+expirou.+Solicite+outro.", request.nextUrl.origin), 303);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    return NextResponse.redirect(new URL("/applications", request.nextUrl.origin), 303);
  } catch (error) {
    destination.searchParams.set("error", error instanceof Error ? error.message : "Não foi possível alterar a senha.");
    return NextResponse.redirect(destination, 303);
  }
}
