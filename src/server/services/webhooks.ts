import "server-only";

import { serviceDb } from "@/server/db/service";
import { paymentProvider } from "@/server/providers/payment";
import type { WebhookEvent } from "@/server/providers/payment/types";
import { checkpoint } from "@/server/checkpoints";
import { log, errorFields } from "@/server/log";
import { syncPayoutStatusByAccount } from "./connect";
import { check } from "./payment-ledger";
import { voidHold } from "./payments";
import { recoverAuthorization, recoverPayout } from "./payment-recovery";
import { recoverFunding } from "./funding";

/**
 * Provider webhooks (Stripe, or the mock in dev/tests). Providers deliver
 * events more than once and out of order, so:
 *  - every event is stored first, then claimed (claim_webhook_event) and
 *    processed; its status (received / processing / processed / failed)
 *    means a failure is retried, by redelivery or by retryUnfinishedWebhooks,
 *    instead of being skipped as a "duplicate";
 *  - only a unique-key conflict counts as a duplicate; any other storage
 *    error is thrown so the provider retries;
 *  - processing only moves state forward, and never touches a record whose
 *    own live operation still holds its lease (recovery settles it if that
 *    process died).
 */

export async function receiveWebhookEvent(event: WebhookEvent): Promise<{ processed: boolean; duplicate: boolean }> {
  const stored = await serviceDb().from("webhook_events").insert({
    id: event.id,
    provider: paymentProvider().name,
    type: event.type,
    payload: event.data as never,
    status: "received",
  });
  if (stored.error && stored.error.code !== "23505") {
    throw new Error(`Could not store webhook ${event.id}: ${stored.error.message}`);
  }
  return processEvent(event);
}

async function processEvent(event: WebhookEvent): Promise<{ processed: boolean; duplicate: boolean }> {
  const db = serviceDb();
  const claimed = check(await db.rpc("claim_webhook_event", { p_id: event.id }), "claim webhook");
  if (!claimed?.length) return { processed: false, duplicate: true }; // done, or in progress elsewhere

  try {
    await checkpoint("webhook.after_claim");
    await applyWebhookEvent(event);
    check(
      await db
        .from("webhook_events")
        .update({ status: "processed", processed_at: new Date().toISOString(), last_error: null, lease_until: null })
        .eq("id", event.id),
      "mark webhook processed",
    );
    return { processed: true, duplicate: false };
  } catch (err) {
    await db
      .from("webhook_events")
      .update({ status: "failed", last_error: err instanceof Error ? err.message : String(err), lease_until: null })
      .eq("id", event.id);
    throw err;
  }
}

/** Retry events that failed, were abandoned mid-processing, or never got processed. */
export async function retryUnfinishedWebhooks(limit = 25): Promise<{ retried: number; failed: number }> {
  const now = new Date();
  const staleReceived = new Date(now.getTime() - 60_000).toISOString();
  const rows = check(
    await serviceDb()
      .from("webhook_events")
      .select("id, type, payload, status, lease_until, received_at")
      .in("status", ["received", "processing", "failed"])
      .order("received_at", { ascending: true })
      .limit(limit * 4),
    "load unfinished webhooks",
  );
  const due = (rows ?? [])
    .filter(
      (r) =>
        r.status === "failed" ||
        (r.status === "processing" && (!r.lease_until || r.lease_until < now.toISOString())) ||
        (r.status === "received" && r.received_at < staleReceived),
    )
    .slice(0, limit);

  let retried = 0;
  let failed = 0;
  for (const row of due) {
    try {
      const res = await processEvent({ id: row.id, type: row.type, data: row.payload as Record<string, unknown> });
      if (res.processed) retried++;
    } catch (err) {
      failed++;
      log.error("Webhook retry failed", { eventId: row.id, ...errorFields(err) });
    }
  }
  return { retried, failed };
}

// ── Applying an event ──────────────────────────────────────────────────

type Signal =
  | { kind: "account"; accountId: string }
  | {
      kind: "intent";
      status: "authorized" | "released" | "expired" | "captured" | "failed";
      intentId: string;
      authRecordId?: string;
      attemptKey?: string;
      capturedCents?: number;
    }
  | { kind: "transfer"; transferId: string; paymentRecordId?: string }
  /** A label's content charge (funding.ts), mock or Stripe. */
  | { kind: "funding"; paymentRecordId?: string }
  | null;

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

/** Mock events and Stripe events, normalized. */
export function toSignal(event: WebhookEvent): Signal {
  const d = event.data;
  const meta = (d.metadata ?? {}) as Record<string, unknown>;
  const fromMeta = { authRecordId: str(meta.authRecordId) ?? str(d.authRecordId), attemptKey: str(meta.attemptKey) ?? str(d.attemptKey) };
  if ((str(meta.kind) ?? str(d.kind)) === "content_funding") {
    return { kind: "funding", paymentRecordId: str(meta.paymentRecordId) ?? str(d.paymentRecordId) };
  }
  switch (event.type) {
    case "account.updated":
      return str(d.id)?.startsWith("acct_") ? { kind: "account", accountId: d.id as string } : null;
    // Mock provider
    case "authorization.succeeded":
      return { kind: "intent", status: "authorized", intentId: d.intentId as string, ...fromMeta };
    case "authorization.released":
      return { kind: "intent", status: "released", intentId: d.intentId as string };
    case "authorization.captured":
      return { kind: "intent", status: "captured", intentId: d.intentId as string, capturedCents: Number(d.amountCents) || 0 };
    case "authorization.failed":
      return { kind: "intent", status: "failed", intentId: d.intentId as string, ...fromMeta };
    case "payout.paid":
      return { kind: "transfer", transferId: d.transferId as string, paymentRecordId: str(d.paymentRecordId) };
    // Stripe
    case "payment_intent.amount_capturable_updated":
      return { kind: "intent", status: "authorized", intentId: d.id as string, ...fromMeta };
    case "payment_intent.canceled": {
      const reason = str(d.cancellation_reason);
      return {
        kind: "intent",
        status: reason === "automatic" || reason === "expired" ? "expired" : "released",
        intentId: d.id as string,
        ...fromMeta,
      };
    }
    case "payment_intent.succeeded":
      return { kind: "intent", status: "captured", intentId: d.id as string, capturedCents: Number(d.amount_received) || 0, ...fromMeta };
    case "payment_intent.payment_failed":
      return { kind: "intent", status: "failed", intentId: d.id as string, ...fromMeta };
    case "transfer.created":
      return { kind: "transfer", transferId: d.id as string, paymentRecordId: str(meta.paymentRecordId) };
    default:
      return null;
  }
}

export async function applyWebhookEvent(event: WebhookEvent): Promise<void> {
  const signal = toSignal(event);
  if (!signal) return;
  if (signal.kind === "account") {
    await syncPayoutStatusByAccount(signal.accountId);
    return;
  }
  if (signal.kind === "funding") {
    // Our own call records the outcome; only settle a charge whose process died.
    if (!signal.paymentRecordId) return;
    const { data: rec } = await serviceDb()
      .from("creator_payment_records")
      .select("id, funding_status, funding_lease_until")
      .eq("id", signal.paymentRecordId)
      .maybeSingle();
    if (rec?.funding_status === "charging" && leaseExpired(rec.funding_lease_until)) await recoverFunding(rec.id);
    return;
  }
  if (signal.kind === "transfer") {
    if (!signal.paymentRecordId) return;
    const { data: rec } = await serviceDb()
      .from("creator_payment_records")
      .select("id, status, lease_until")
      .eq("id", signal.paymentRecordId)
      .maybeSingle();
    if (rec?.status === "paying" && leaseExpired(rec.lease_until)) await recoverPayout(rec.id);
    return;
  }
  await applyIntentSignal(signal);
}

const leaseExpired = (lease: string | null) => !lease || new Date(lease) < new Date();

async function applyIntentSignal(signal: Extract<Signal, { kind: "intent" }>): Promise<void> {
  const db = serviceDb();
  const columns = "id, status, lease_until, idempotency_key, provider_intent_id";
  let { data: rec } = await db.from("authorization_records").select(columns).eq("provider_intent_id", signal.intentId).maybeSingle();
  if (!rec && signal.authRecordId) {
    // We may never have saved the intent id (crash mid-call): fall back to the
    // record named in the intent's metadata, if the attempt matches.
    const { data } = await db.from("authorization_records").select(columns).eq("id", signal.authRecordId).maybeSingle();
    if (data && (!signal.attemptKey || data.idempotency_key === signal.attemptKey)) rec = data;
  }
  if (!rec) return;

  if (["pending", "releasing", "capturing"].includes(rec.status)) {
    // Its own operation is finishing it; if that process died, settle now.
    if (leaseExpired(rec.lease_until)) await recoverAuthorization(rec.id);
    return;
  }
  if (rec.status === "canceled" && signal.status === "authorized" && !rec.provider_intent_id) {
    // A hold appeared for a booking canceled mid-placement: void it.
    await voidHold(rec.id, signal.intentId, `void:${rec.idempotency_key ?? rec.id}`);
    return;
  }
  if (rec.status !== "authorized") return; // final states never move backwards

  // The hold changed outside our own calls (expired, released or charged at
  // the provider): record it, forward only.
  const now = new Date().toISOString();
  if (signal.status === "expired" || signal.status === "released") {
    check(
      await db
        .from("authorization_records")
        .update({ status: signal.status, released_at: now })
        .eq("id", rec.id)
        .eq("status", "authorized"),
      "record hold change from provider",
    );
  } else if (signal.status === "captured") {
    check(
      await db
        .from("authorization_records")
        .update({ status: "captured", captured_at: now, capture_amount_cents: signal.capturedCents ?? null })
        .eq("id", rec.id)
        .eq("status", "authorized"),
      "record capture from provider",
    );
  }
}
