import { NextResponse, type NextRequest } from "next/server";
import { runScheduledJobs } from "@/server/services/jobs";
import { serverEnv } from "@/lib/env";
import { log, errorFields } from "@/server/log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduled-job endpoint. Protect with CRON_SECRET. Accepts the secret via
 * either an `x-cron-secret` header (Railway cron service / manual runs) or an
 * `Authorization: Bearer <secret>` header (external cron schedulers).
 */
export async function POST(request: NextRequest) {
  const provided =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!provided || provided !== serverEnv.cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const results = await runScheduledJobs();
    log.info("Scheduled jobs run", { results });
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    // Individual steps already isolate their own failures; this only fires on
    // an unexpected error outside the steps (e.g. the DB client itself).
    log.error("Scheduled job run failed", errorFields(err));
    return NextResponse.json({ ok: false, error: "Job run failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
