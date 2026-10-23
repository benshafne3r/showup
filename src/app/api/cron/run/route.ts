import { NextResponse, type NextRequest } from "next/server";
import { runScheduledJobs } from "@/server/services/jobs";
import { serverEnv } from "@/lib/env";
import { log, errorFields } from "@/server/log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduler tick. Protect with CRON_SECRET (`x-cron-secret` header, or
 * `Authorization: Bearer <secret>`). Enqueues everything that's due as
 * durable jobs, then runs due jobs for a bounded slice of time (the worker
 * process, `npm run worker`, does the rest). Job failures are retried by the
 * queue and show up in /api/health; this returns 500 only if scheduling
 * itself failed.
 */
export async function POST(request: NextRequest) {
  const provided =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!provided || provided !== serverEnv.cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const results = await runScheduledJobs(45_000);
    log.info("Scheduler tick", { results });
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    log.error("Scheduler tick failed", errorFields(err));
    return NextResponse.json({ ok: false, error: "Job run failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
