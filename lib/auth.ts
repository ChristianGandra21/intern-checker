import type { User } from "@supabase/supabase-js";
import { cache } from "react";
import { createSupabaseServerClient, hasAuthConfig } from "@/lib/supabase/server";

export const getOptionalUser = cache(async (): Promise<User | null> => {
  if (!hasAuthConfig()) return null;
  try {
    const client = await createSupabaseServerClient();
    const { data, error } = await client.auth.getUser();
    return error ? null : data.user;
  } catch {
    return null;
  }
});

export async function requireUser() {
  const user = await getOptionalUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}
