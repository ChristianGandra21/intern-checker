import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function publicConfig() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "",
    key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "",
  };
}

export function hasAuthConfig() {
  const { url, key } = publicConfig();
  return Boolean(url && key);
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, key } = publicConfig();
  if (!url || !key) throw new Error("Autenticação Supabase não configurada.");
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components não podem escrever cookies; proxy.ts cuida da renovação.
        }
      },
    },
  });
}
