import { NextResponse, type NextRequest } from "next/server";
import { runScheduledJobs } from "@/server/services/jobs";
import { serverEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduled-job endpoint. Protect with CRON_SECRET; compatible with Vercel
 * Cron (Authorization: Bearer <secret>) and manual/local runs
 * (x-cron-secret header).
 */
export async function POST(request: NextRequest) {
  const provided =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!provided || provided !== serverEnv.cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const results = await runScheduledJobs();
  return NextResponse.json({ ok: true, results });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
