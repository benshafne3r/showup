/**
 * Which repo migrations a database has (and hasn't) recorded.
 *
 *   npm run db:status            # local stack (.env.local)
 *   npm run db:status -- --prod  # live project (.env.production.local)
 *
 * Exits 1 if anything is missing. Apply a missing file to prod with the
 * Supabase MCP `apply_migration`, naming it exactly as the file (e.g.
 * "0013_migration_status") so it's recorded and matched here.
 */
import { readdirSync } from "node:fs";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { missingMigrations } from "../src/lib/migrations";

const prod = process.argv.includes("--prod");
config({ path: prod ? ".env.production.local" : ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(`Missing Supabase URL / service key in ${prod ? ".env.production.local" : ".env.local"}`);
  process.exit(1);
}

async function main() {
  const db = createClient<Database>(url!, serviceKey!, { auth: { persistSession: false } });
  const { data: applied, error } = await db.rpc("applied_migrations");
  if (error) {
    console.error(`Couldn't read migration records (is 0013_migration_status applied?): ${error.message}`);
    process.exit(1);
  }
  const files = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
  const missing = new Set(missingMigrations(files, applied ?? []));
  console.log(`${prod ? "LIVE" : "local"} database (${url})\n`);
  for (const file of files) {
    const base = file.replace(/\.sql$/, "");
    console.log(`  ${missing.has(base) ? "✗ MISSING" : "✓        "}  ${base}`);
  }
  console.log(missing.size ? `\n${missing.size} migration(s) not applied.` : "\nAll migrations applied.");
  process.exit(missing.size ? 1 : 0);
}

main();
