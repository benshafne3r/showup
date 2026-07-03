import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import { publicEnv } from "@/lib/env";

/**
 * Cookie-scoped Supabase client for the signed-in user. Queries run under
 * RLS with the caller's identity — use for reads and benign self-service
 * writes. Sensitive mutations go through the service layer instead.
 */
export async function userDb() {
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
