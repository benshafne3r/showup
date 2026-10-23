import "server-only";

import os from "node:os";
import { randomUUID } from "node:crypto";
import type { Json } from "@/lib/database.types";
import { serviceDb } from "@/server/db/service";
import { log, errorFields } from "@/server/log";
import { checkpoint } from "@/server/checkpoints";

/**
 * Durable jobs (table `jobs`): the outbox for work a transition causes
 * (notifications, releasing holds) and the queue for scheduled work. Jobs
 * are claimed with a lease (FOR UPDATE SKIP LOCKED), retried with backoff,
 * and marked dead after max_attempts. Handlers must be idempotent: a job can
 * run again if its worker dies after doing the work but before completing it.
 */

export type JobRow = {
  id: number;
  kind: string;
  dedupe_key: string | null;
  payload: Json;
  attempts: number;
  max_attempts: number;
  company_id: string | null;
};

export type OutboxJob = {
  kind: string;
  payload: Record<string, unknown>;
  /** Unique delivery key: enqueueing the same work twice is a no-op. */
  dedupe_key: string;
  /** 0 = money / correctness … 9 = marketing. */
  priority?: number;
  company_id?: string | null;
};

export const WORKER_ID = `${os.hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;

export async function enqueueJobs(jobs: OutboxJob[]): Promise<void> {
  if (!jobs.length) return;
  const { error } = await serviceDb().rpc("enqueue_jobs", { p_jobs: jobs as unknown as Json });
  if (error) throw new Error(`enqueue jobs: ${error.message}`);
}

async function runOne(job: JobRow, worker: string): Promise<boolean> {
  const { JOB_HANDLERS } = await import("./handlers");
  const db = serviceDb();
  const handler = JOB_HANDLERS[job.kind as keyof typeof JOB_HANDLERS];
  try {
    if (!handler) throw new Error(`No handler for job kind "${job.kind}"`);
    // The job's key doubles as the idempotency key for what it sends.
    await (handler as (p: unknown, ctx: { key: string }) => Promise<unknown>)(job.payload, {
      key: job.dedupe_key ?? `job:${job.id}`,
    });
    const { error } = await db.rpc("complete_job", { p_id: job.id, p_worker: worker });
    if (error) throw new Error(`complete job: ${error.message}`);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("Job failed", { jobId: job.id, kind: job.kind, attempt: job.attempts, ...errorFields(err) });
    await db.rpc("fail_job", { p_id: job.id, p_worker: worker, p_error: message });
    return false;
  }
}

/**
 * Run the jobs a transition just enqueued, right after its commit, so users
 * see the effects immediately. Best effort: anything that fails (or that this
 * process doesn't get to) stays queued for the worker.
 */
export async function runOutboxNow(keys: string[]): Promise<void> {
  if (!keys.length) return;
  await checkpoint("outbox.before_run");
  try {
    const { data, error } = await serviceDb().rpc("claim_jobs_by_keys", { p_worker: WORKER_ID, p_keys: keys });
    if (error) throw new Error(error.message);
    for (const job of (data ?? []) as JobRow[]) await runOne(job, WORKER_ID);
  } catch (err) {
    log.error("Running outbox jobs inline failed (the worker will retry)", errorFields(err));
  }
}

/** Claim and run due jobs until none are left or the time budget is spent. */
export async function drainJobs(opts: { budgetMs?: number; batch?: number; kinds?: string[]; worker?: string } = {}) {
  const deadline = Date.now() + (opts.budgetMs ?? 30_000);
  const worker = opts.worker ?? WORKER_ID;
  let ran = 0;
  let failed = 0;
  const byKind: Record<string, number> = {};
  while (Date.now() < deadline) {
    const { data, error } = await serviceDb().rpc("claim_jobs", {
      p_worker: worker,
      p_limit: opts.batch ?? 20,
      p_kinds: opts.kinds ?? undefined,
    });
    if (error) throw new Error(`claim jobs: ${error.message}`);
    const jobs = (data ?? []) as JobRow[];
    if (!jobs.length) break;
    for (const job of jobs) {
      if (await runOne(job, worker)) {
        ran++;
        byKind[job.kind] = (byKind[job.kind] ?? 0) + 1;
      } else failed++;
    }
  }
  return { ran, failed, byKind };
}
