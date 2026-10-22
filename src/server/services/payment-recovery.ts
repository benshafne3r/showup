import "server-only";

import { serviceDb } from "@/server/db/service";
import { paymentProvider } from "@/server/providers/payment";
import { serverEnv } from "@/lib/env";
import { log, errorFields } from "@/server/log";
import { payoutDestinationFor } from "./connect";
import { check, finishOperation, latestOperation, leaseUntil, type Actor } from "./payment-ledger";
import {
  finishAuthorization,
  finishCapture,
  finishPayout,
  finishRelease,
  voidHold,
} from "./payments";

/**
 * Finish payment operations a crash left half-done. A record still in an
 * in-flight state (pending / releasing / capturing / paying) after its lease
 * expired means the process died around the provider call. Ask the provider
 * what actually happened and settle it; if the provider never saw the call,
 * replay it with the SAME idempotency key (within Stripe's 24-hour window),
 * which can't move money twice.
 */

const SYSTEM: Actor = { id: null, role: "system" };
/** Stripe keeps idempotency keys for 24 hours; don't replay a key older than this. */
const REPLAY_WINDOW_MS = 23 * 3_600_000;

const AUTH_COLUMNS =
  "id, status, booking_id, creator_id, company_id, amount_cents, attempt_count, idempotency_key, provider_intent_id, payment_method_id";

export async function recoverPaymentOperations(limit = 25): Promise<{ recovered: number; failed: number }> {
  const db = serviceDb();
  const now = new Date().toISOString();
  let recovered = 0;
  let failed = 0;
  const run = async (what: string, id: string, fn: () => Promise<boolean>) => {
    try {
      if (await fn()) recovered++;
    } catch (err) {
      failed++;
      log.error("Payment recovery failed", { what, id, ...errorFields(err) });
    }
  };

  const holds = check(
    await db
      .from("authorization_records")
      .select("id")
      .in("status", ["pending", "releasing", "capturing"])
      .lt("lease_until", now)
      .order("lease_until", { ascending: true })
      .limit(limit),
    "load stalled holds",
  );
  for (const h of holds ?? []) await run("hold", h.id, () => recoverAuthorization(h.id));

  const payouts = check(
    await db
      .from("creator_payment_records")
      .select("id")
      .eq("status", "paying")
      .lt("lease_until", now)
      .order("lease_until", { ascending: true })
      .limit(limit),
    "load stalled payouts",
  );
  for (const p of payouts ?? []) await run("payout", p.id, () => recoverPayout(p.id));

  // Authorize calls that never finished on a hold that was then canceled: a
  // hold may exist on the card with nothing tracking it. Void it.
  const orphans = check(
    await db
      .from("payment_operations")
      .select("id, idempotency_key, authorization_record_id, authorization_records!inner(status)")
      .eq("kind", "authorize")
      .eq("status", "started")
      .lt("lease_until", now)
      .eq("authorization_records.status", "canceled")
      .limit(limit),
    "load orphaned authorizations",
  );
  for (const o of orphans ?? []) {
    await run("orphan", o.id, async () => {
      const seen = await paymentProvider().lookupIntent({
        authRecordId: o.authorization_record_id!,
        attemptKey: o.idempotency_key,
      });
      if (seen.found && seen.state === "requires_capture") {
        await voidHold(o.authorization_record_id!, seen.intentId, `void:${o.idempotency_key}`);
      }
      await finishOperation(o.id, {
        status: "succeeded",
        providerRef: seen.found ? seen.intentId : null,
        error: seen.found ? null : "Never reached the provider",
      });
      return true;
    });
  }
  return { recovered, failed };
}

/** Re-lease a stalled record so two recovery runs can't work it at once. */
async function release<T>(table: "authorization_records" | "creator_payment_records", id: string, columns: string) {
  const db = serviceDb();
  const res = await db
    .from(table)
    .update({ lease_until: leaseUntil() })
    .eq("id", id)
    .lt("lease_until", new Date().toISOString())
    .select(columns)
    .maybeSingle();
  return check(res, `re-lease ${table}`) as T | null;
}

type StalledHold = {
  id: string;
  status: "pending" | "releasing" | "capturing";
  booking_id: string;
  creator_id: string;
  company_id: string;
  amount_cents: number;
  attempt_count: number;
  idempotency_key: string | null;
  provider_intent_id: string | null;
  payment_method_id: string | null;
};

export async function recoverAuthorization(id: string): Promise<boolean> {
  const db = serviceDb();
  const rec = await release<StalledHold>("authorization_records", id, AUTH_COLUMNS);
  if (!rec || !["pending", "releasing", "capturing"].includes(rec.status)) return false;
  const provider = paymentProvider();

  if (rec.status === "pending") {
    const key = rec.idempotency_key!;
    const op = await latestOperation("authorize", { idempotencyKey: key });
    if (!op) {
      // Died before calling the provider: put it back to be placed again.
      check(
        await db
          .from("authorization_records")
          .update({ status: "scheduled", lease_until: null })
          .eq("id", rec.id)
          .eq("status", "pending"),
        "reschedule unplaced hold",
      );
      return true;
    }
    const seen = await provider.lookupIntent({ authRecordId: rec.id, attemptKey: key });
    if (seen.found && (seen.state === "requires_capture" || seen.state === "succeeded")) {
      await finishAuthorization(rec, op.id, { ok: true, providerIntentId: seen.intentId, expiresAt: seen.expiresAt });
      return true;
    }
    if (seen.found) {
      await finishAuthorization(rec, op.id, { ok: false, failureReason: "The card authorization didn't go through" });
      return true;
    }
    if (Date.now() - new Date(op.created_at).getTime() > REPLAY_WINDOW_MS) {
      await finishAuthorization(rec, op.id, { ok: false, failureReason: "The hold attempt was interrupted; retry it" });
      return true;
    }
    // The provider never saw it: replay the same call with the same key.
    const { data: pm } = await db
      .from("payment_methods")
      .select("provider_method_id")
      .eq("id", rec.payment_method_id ?? "")
      .maybeSingle();
    if (!pm) {
      await finishAuthorization(rec, op.id, { ok: false, failureReason: "No verified payment method on file" });
      return true;
    }
    const result = await provider.authorize({
      providerMethodId: pm.provider_method_id,
      amountCents: rec.amount_cents,
      idempotencyKey: key,
      metadata: { bookingId: rec.booking_id, authRecordId: rec.id, attemptKey: key },
    });
    await finishAuthorization(rec, op.id, result);
    return true;
  }

  const kind = rec.status === "releasing" ? "release" : "capture";
  const op = await latestOperation(kind, { authorizationRecordId: rec.id });
  if (!op || op.status !== "started") {
    // Died before calling the provider: the hold is still simply active.
    check(
      await db
        .from("authorization_records")
        .update({ status: "authorized", lease_until: null })
        .eq("id", rec.id)
        .eq("status", rec.status),
      "restore active hold",
    );
    return true;
  }
  const seen = await provider.lookupIntent({ providerIntentId: rec.provider_intent_id, authRecordId: rec.id });

  if (rec.status === "releasing") {
    if (seen.found && seen.state === "requires_capture") {
      const result = await provider.release({ providerIntentId: rec.provider_intent_id!, idempotencyKey: op.idempotency_key });
      await finishRelease(rec, op.id, result, SYSTEM);
    } else {
      // canceled → released; succeeded → finishRelease reconciles it as captured.
      await finishRelease(rec, op.id, seen.found && seen.state === "canceled" ? { ok: true } : { ok: false, failureReason: "Hold not releasable" }, SYSTEM);
    }
    return true;
  }

  // capturing
  if (seen.found && seen.state === "succeeded") {
    await finishCapture(rec, op.id, { ok: true, capturedCents: seen.capturedCents }, SYSTEM);
  } else if (seen.found && seen.state === "requires_capture") {
    const result = await provider.capture({
      providerIntentId: rec.provider_intent_id!,
      amountCents: rec.amount_cents,
      idempotencyKey: op.idempotency_key,
    });
    await finishCapture(rec, op.id, result, SYSTEM);
  } else {
    await finishCapture(rec, op.id, { ok: false, failureReason: "The hold is no longer active" }, SYSTEM);
  }
  return true;
}

type StalledPayout = {
  id: string;
  status: string;
  booking_id: string;
  creator_id: string;
  company_id: string;
  amount_cents: number;
  idempotency_key: string | null;
};

export async function recoverPayout(id: string): Promise<boolean> {
  const db = serviceDb();
  const rec = await release<StalledPayout>(
    "creator_payment_records",
    id,
    "id, status, booking_id, creator_id, company_id, amount_cents, idempotency_key",
  );
  if (!rec || rec.status !== "paying") return false;
  const key = rec.idempotency_key!;
  const op = await latestOperation("payout", { idempotencyKey: key });
  if (!op) {
    check(
      await db
        .from("creator_payment_records")
        .update({ status: "ready", lease_until: null })
        .eq("id", rec.id)
        .eq("status", "paying"),
      "restore unpaid payout",
    );
    return true;
  }
  const destination = await payoutDestinationFor(rec.creator_id);
  const seen = await paymentProvider().lookupTransfer({ paymentRecordId: rec.id, attemptKey: key });
  if (seen.found) {
    await finishPayout(rec, op.id, { ok: true, providerTransferId: seen.transferId }, SYSTEM, destination.agency);
    return true;
  }
  if (Date.now() - new Date(op.created_at).getTime() > REPLAY_WINDOW_MS) {
    await finishPayout(rec, op.id, { ok: false, failureReason: "The payout was interrupted; retry it" }, SYSTEM, destination.agency);
    return true;
  }
  const result = await paymentProvider().payout({
    creatorUserId: rec.creator_id,
    amountCents: rec.amount_cents,
    idempotencyKey: key,
    metadata: { bookingId: rec.booking_id, paymentRecordId: rec.id, attemptKey: key },
    destinationAccountId:
      serverEnv.paymentProvider === "stripe" ? (destination.accountId ?? undefined) : undefined,
    transferGroup: rec.id,
  });
  await finishPayout(rec, op.id, result, SYSTEM, destination.agency);
  return true;
}
