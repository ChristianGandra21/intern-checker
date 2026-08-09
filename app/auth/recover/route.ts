import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const destination = new URL("/forgot-password", request.nextUrl.origin);
  if (!email || !email.includes("@")) {
    destination.searchParams.set("error", "Informe um e-mail válido.");
    return NextResponse.redirect(destination, 303);
  }
  try {
    const supabase = await createSupabaseServerClient();
    const callback = new URL("/auth/callback", process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin);
    callback.searchParams.set("next", "/reset-password");
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: callback.toString() });
    destination.searchParams.set("message", "Se a conta existir, você receberá um link para redefinir a senha.");
  } catch {
    destination.searchParams.set("error", "Não foi possível solicitar a recuperação agora.");
  }
  return NextResponse.redirect(destination, 303);
}
