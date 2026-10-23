/**
 * Job worker: runs the durable job queue continuously.
 *
 *   npm run worker                 (local: reads .env.local)
 *
 * In production run it as its own service with the app's environment
 * variables (start command `npm run worker`). It also runs the scheduler once
 * a minute (enqueueing is idempotent), so it doesn't depend on the external
 * cron. Several workers can run at once: jobs are claimed with leases and
 * FOR UPDATE SKIP LOCKED. On SIGTERM/SIGINT it finishes the job in hand and
 * exits; anything unfinished is reclaimed by another worker after its lease.
 */
import { config } from "dotenv";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) config({ path: ".env.local" });

const SCHEDULE_EVERY_MS = 60_000;
const IDLE_SLEEP_MS = 2_000;
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    stopping = true;
    console.log(JSON.stringify({ level: "info", msg: `worker: ${signal}, finishing current batch` }));
  });
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { drainJobs, WORKER_ID } = await import("../src/server/jobs/queue");
  const { runScheduler, heartbeat } = await import("../src/server/services/jobs");
  console.log(JSON.stringify({ level: "info", msg: "worker started", worker: WORKER_ID }));

  let lastSchedule = 0;
  while (!stopping) {
    try {
      if (Date.now() - lastSchedule > SCHEDULE_EVERY_MS) {
        const { scheduled } = await runScheduler();
        await heartbeat("worker", { worker: WORKER_ID });
        lastSchedule = Date.now();
        const total = Object.values(scheduled).reduce((a, b) => a + b, 0);
        if (total) console.log(JSON.stringify({ level: "info", msg: "scheduled", scheduled }));
      }
      // Short slices so a stop signal is honored quickly.
      const { ran, failed } = await drainJobs({ budgetMs: 10_000, batch: 10, worker: WORKER_ID });
      if (ran || failed) console.log(JSON.stringify({ level: "info", msg: "jobs", ran, failed }));
      else await sleep(IDLE_SLEEP_MS);
    } catch (err) {
      console.error(JSON.stringify({ level: "error", msg: "worker loop error", error: err instanceof Error ? err.message : String(err) }));
      await sleep(5_000);
    }
  }
  console.log(JSON.stringify({ level: "info", msg: "worker stopped", worker: WORKER_ID }));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
