import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    // A saída local ainda redireciona mesmo se o provedor estiver indisponível.
  }
  return NextResponse.redirect(new URL("/", request.nextUrl.origin), 303);
}
