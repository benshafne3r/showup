import { readdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { serviceDb } from "@/server/db/service";
import { missingMigrations } from "@/lib/migrations";
import { log, errorFields } from "@/server/log";

export const dynamic = "force-dynamic";

/**
 * Health check for uptime monitors: 200 when the database answers and has
 * recorded every migration in the repo, 503 otherwise. A missing migration
 * means deployed code may query columns that don't exist (how payouts broke).
 */
export async function GET() {
  const problems: string[] = [];

  const { data: applied, error } = await serviceDb().rpc("applied_migrations");
  if (error) {
    problems.push("database unreachable");
    log.error("Health check: database query failed", errorFields(error));
  } else {
    try {
      const files = await readdir(path.join(process.cwd(), "supabase", "migrations"));
      const missing = missingMigrations(files, applied ?? []);
      if (missing.length) {
        problems.push(`migrations not applied: ${missing.join(", ")}`);
        log.error("Health check: migrations missing", { missing });
      }
    } catch {
      // Migration files aren't shipped in every build; the DB check still counts.
    }
  }

  return NextResponse.json(
    {
      ok: problems.length === 0,
      problems,
      commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    },
    { status: problems.length ? 503 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
