import "server-only";

import type { NotifyInput } from "@/server/services/notifications";
import type { OutboxJob } from "./queue";

/**
 * Builders for outbox jobs. A transition passes these to its SQL function so
 * they're written in the same transaction, then runs them with runOutboxNow.
 * The dedupe key doubles as the notification's idempotency key.
 */

type Actor = { id: string | null; role: string };

export function notifyJob(key: string, input: NotifyInput, companyId?: string | null): OutboxJob {
  return {
    kind: "notify",
    payload: { input: { ...input, dedupeKey: key, strict: true } },
    dedupe_key: key,
    priority: 3,
    company_id: companyId ?? null,
  };
}

/** Like notifyJob, but without copying the creator's management team. */
export function deliverJob(key: string, input: NotifyInput, companyId?: string | null): OutboxJob {
  return {
    kind: "deliver",
    payload: { input: { ...input, dedupeKey: key, strict: true } },
    dedupe_key: key,
    priority: 3,
    company_id: companyId ?? null,
  };
}

export function notifyCompanyJob(key: string, companyId: string, input: Omit<NotifyInput, "userId">): OutboxJob {
  return {
    kind: "notify_company",
    payload: { companyId, input: { ...input, dedupeKey: key, strict: true } },
    dedupe_key: key,
    priority: 3,
    company_id: companyId,
  };
}

export function notifyAgencyJob(key: string, agencyId: string, input: Omit<NotifyInput, "userId">): OutboxJob {
  return {
    kind: "notify_agency",
    payload: { agencyId, input: { ...input, dedupeKey: key, strict: true } },
    dedupe_key: key,
    priority: 3,
  };
}

/** Release any active hold on a booking that was just closed out (money: top priority). */
export function releaseHoldsJob(bookingId: string, actor: Actor, companyId?: string | null): OutboxJob {
  return {
    kind: "release_holds",
    payload: { bookingId, actor },
    dedupe_key: `release_holds:${bookingId}`,
    priority: 0,
    company_id: companyId ?? null,
  };
}

export const keysOf = (jobs: OutboxJob[]) => jobs.map((j) => j.dedupe_key);
