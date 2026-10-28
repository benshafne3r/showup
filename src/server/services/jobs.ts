import "server-only";

import { serviceDb } from "@/server/db/service";
import { drainJobs, enqueueJobs } from "@/server/jobs/queue";
import { fanOutCityAlerts } from "./show-alerts";

/**
 * Scheduling. runScheduler() only decides what's due and enqueues it (fast,
 * bounded): schedule_due_jobs() selects due records in SQL with unique job
 * keys, periodic jobs (payment recovery, webhook retries) keyed per minute,
 * and the city-alert fan-out, which only turns new shows into one email job
 * per subscriber. The work itself runs in jobs: in the
 * worker process (`npm run worker`), and, as a fallback, for a bounded time
 * slice after each scheduler tick (/api/cron/run).
 */

export type SchedulerResult = { scheduled: Record<string, number> };

export async function heartbeat(name: string, info: Record<string, unknown> = {}): Promise<void> {
  await serviceDb()
    .from("heartbeats")
    .upsert({ name, at: new Date().toISOString(), info: info as never });
}

export async function runScheduler(): Promise<SchedulerResult> {
  const db = serviceDb();
  const { data, error } = await db.rpc("schedule_due_jobs", { p_limit: 500 });
  if (error) throw new Error(`schedule due jobs: ${error.message}`);
  const minute = Math.floor(Date.now() / 60_000);
  await enqueueJobs([
    { kind: "recover_payments", payload: {}, dedupe_key: `recover_payments:${minute}`, priority: 0 },
    { kind: "retry_webhooks", payload: {}, dedupe_key: `retry_webhooks:${minute}`, priority: 0 },
  ]);
  const alerts = await fanOutCityAlerts();
  const scheduled = {
    ...Object.fromEntries((data ?? []).map((r) => [r.kind, r.enqueued])),
    city_alert_email: alerts.alerts,
  };
  await heartbeat("scheduler", { scheduled });
  return { scheduled };
}

async function queueStats() {
  const { data, error } = await serviceDb().rpc("job_queue_stats");
  if (error) throw new Error(`job queue stats: ${error.message}`);
  return data?.[0] ?? { queued: 0, running: 0, dead: 0, oldest_due_seconds: 0, retrying: 0 };
}

/**
 * Fallback tick (/api/cron/run): schedule, run due jobs, then schedule once
 * more so follow-on work (e.g. a reminder that's due once a hold was placed
 * in the same tick) runs now instead of a tick later. Bounded by `budgetMs`.
 */
export async function runScheduledJobs(budgetMs = 45_000) {
  const deadline = Date.now() + budgetMs;
  const scheduled: Record<string, number> = {};
  const ran: Record<string, number> = {};
  let jobsRun = 0;
  let jobsFailed = 0;
  for (let pass = 0; pass < 2 && Date.now() < deadline; pass++) {
    const tick = await runScheduler();
    for (const [k, v] of Object.entries(tick.scheduled)) scheduled[k] = (scheduled[k] ?? 0) + v;
    const drained = await drainJobs({ budgetMs: Math.max(0, deadline - Date.now()) });
    for (const [k, v] of Object.entries(drained.byKind)) ran[k] = (ran[k] ?? 0) + v;
    jobsRun += drained.ran;
    jobsFailed += drained.failed;
  }
  return { scheduled, ran, jobsRun, jobsFailed, queue: await queueStats() };
}
