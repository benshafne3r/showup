import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { publicEnv, serverEnv } from "@/lib/env";

export type ServiceClient = SupabaseClient<Database>;

let cached: ServiceClient | null = null;

/**
 * Service-role client. Bypasses RLS — only ever call this from the service
 * layer after an explicit authorization check (see src/server/auth/guards.ts).
 */
export function serviceDb(): ServiceClient {
  if (!cached) {
    cached = createClient<Database>(
      publicEnv.supabaseUrl,
      serverEnv.supabaseServiceRoleKey,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return cached;
}
