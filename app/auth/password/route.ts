import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function safeNext(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/applications";
}

function loginRedirect(request: NextRequest, values: Record<string, string>) {
  const url = new URL("/login", request.nextUrl.origin);
  Object.entries(values).forEach(([key, value]) => url.searchParams.set(key, value));
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const mode = form.get("mode") === "signup" ? "signup" : "login";
  const next = safeNext(form.get("next"));
  if (!email || !email.includes("@") || password.length < 8) {
    return loginRedirect(request, { mode, next, error: "Informe um e-mail válido e uma senha com pelo menos 8 caracteres." });
  }

  try {
    const supabase = await createSupabaseServerClient();
    if (mode === "signup") {
      const callback = new URL("/auth/callback", process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin);
      callback.searchParams.set("next", next);
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: callback.toString() } });
      if (error) return loginRedirect(request, { mode, next, error: error.message });
      if (!data.session) return loginRedirect(request, { next, message: "Conta criada. Confira seu e-mail para confirmar o acesso." });
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return loginRedirect(request, { next, error: "E-mail ou senha inválidos." });
    }
    return NextResponse.redirect(new URL(next, request.nextUrl.origin), 303);
  } catch (error) {
    return loginRedirect(request, { mode, next, error: error instanceof Error ? error.message : "Falha na autenticação." });
  }
}
