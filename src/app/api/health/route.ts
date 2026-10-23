import { readdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { serviceDb } from "@/server/db/service";
import { missingMigrations } from "@/lib/migrations";
import { log, errorFields } from "@/server/log";

export const dynamic = "force-dynamic";

/**
 * Health check for uptime monitors: 200 when the database answers, has
 * recorded every migration in the repo, and bookings agree with inventory;
 * 503 otherwise. A missing migration means deployed code may query columns
 * that don't exist (how payouts broke).
 */
export async function GET() {
  const problems: string[] = [];
  let jobQueue: unknown = null;

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

    // Job queue: nothing dead, no backlog, scheduler running.
    const [{ data: stats }, { data: beat }] = await Promise.all([
      serviceDb().rpc("job_queue_stats"),
      serviceDb().from("heartbeats").select("at").eq("name", "scheduler").maybeSingle(),
    ]);
    const queue = stats?.[0];
    if (queue?.dead) problems.push(`jobs: ${queue.dead} dead (failed every retry)`);
    if (queue && queue.oldest_due_seconds > 30 * 60) problems.push(`jobs: backlog (oldest waiting ${Math.round(queue.oldest_due_seconds / 60)} min)`);
    if (beat && Date.now() - new Date(beat.at).getTime() > 30 * 60_000) problems.push("scheduler: no tick in 30 min");
    jobQueue = queue ?? null;

    // Booking consistency: inventory that disagrees with live bookings, or an
    // approval without its booking, means a transition went wrong somewhere.
    const { data: inconsistent, error: consistencyError } = await serviceDb().rpc("booking_consistency");
    if (!consistencyError && inconsistent?.length) {
      problems.push(`booking consistency: ${inconsistent.length} issue(s)`);
      log.error("Health check: booking consistency", { issues: inconsistent.slice(0, 10) });
    }
  }

  return NextResponse.json(
    {
      ok: problems.length === 0,
      problems,
      jobs: jobQueue,
      commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    },
    { status: problems.length ? 503 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
