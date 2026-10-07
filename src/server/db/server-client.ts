import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { publicEnv } from "@/lib/env";

/**
 * Cookie-scoped Supabase client for the real signed-in session. Use for auth
 * (getUser, sign in/out, password updates). Data reads should use userDb().
 */
export async function sessionClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — session refresh is handled by middleware.
          }
        },
      },
    },
  );
}

/**
 * Data client for the signed-in user: queries run under RLS with the caller's
 * identity — use for reads and benign self-service writes. Sensitive
 * mutations go through the service layer instead.
 *
 * While the platform owner is "viewing as" someone, RLS would scope rows to
 * the owner, so reads use the service client; every such page also filters
 * by the (viewed) user's id explicitly.
 */
export async function userDb(): Promise<SupabaseClient<Database>> {
  const { readViewAs } = await import("@/server/auth/view-as");
  if (await readViewAs()) {
    const { serviceDb } = await import("@/server/db/service");
    return serviceDb();
  }
  return (await sessionClient()) as unknown as SupabaseClient<Database>;
}
