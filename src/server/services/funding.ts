import "server-only";

import { serviceDb } from "@/server/db/service";
import { paymentProvider } from "@/server/providers/payment";
import type { ChargeResult, RefundResult } from "@/server/providers/payment/types";
import { checkpoint } from "@/server/checkpoints";
import { formatCents, labelChargeCents } from "@/lib/money";
import { audit } from "./audit";
import { notifyCompany } from "./notifications";
import { check, finishOperation, latestOperation, leaseUntil, startOperation, type Actor } from "./payment-ledger";
import { companyDefaultPaymentMethod, payoutCreatorPayment } from "./payments";

/**
 * Labels pay for creator content (Ben, 2026-10-23): the label's saved card is
 * charged the content fee plus card processing (labelChargeCents) when they
 * approve the content, and the creator's payout of the fee draws on that
 * charge. Same safety rules as payments.ts:
 *  - claim_funding moves the record to 'charging' with a per-attempt key and
 *    a lease; the key is stored (payment_operations) before the provider call;
 *  - 'charged' only once the provider confirms; a crash leaves 'charging' and
 *    recoverFunding asks the provider what happened (or replays the same key);
 *  - a charged record that ends up canceled is refunded (refundFunding), from
 *    the recovery sweep, so no cancel path can strand a label's money.
 */

const SYSTEM: Actor = { id: null, role: "system" };
/** Stripe keeps idempotency keys for 24 hours; don't replay a key older than this. */
const REPLAY_WINDOW_MS = 23 * 3_600_000;

type FundingRow = {
  id: string;
  booking_id: string;
  company_id: string;
  amount_cents: number;
  funding_amount_cents: number | null;
  funding_key: string | null;
  funding_intent_id: string | null;
};

/** chargedCents: what this call charged the label's card (0 when nothing was due). */
type FundingResult = { ok: true; chargedCents: number } | { ok: false; error: string };

/**
 * Make sure a booking's creator payment is paid for by the label: charge the
 * label's default card unless it's already charged (or needs no money).
 */
export async function fundCreatorPayment(bookingId: string, actor: Actor): Promise<FundingResult> {
  const db = serviceDb();
  const record = check(
    await db
      .from("creator_payment_records")
      .select("id, status, amount_cents, company_id, paused_at, funding_status")
      .eq("booking_id", bookingId)
      .maybeSingle(),
    "load creator payment",
  );
  if (!record || record.amount_cents <= 0 || record.status === "not_required") return { ok: true, chargedCents: 0 };
  if (record.funding_status === "charged" || record.funding_status === "waived") return { ok: true, chargedCents: 0 };
  if (record.funding_status === "charging") {
    return { ok: false, error: "The payment for this content is already going through. Try again in a minute." };
  }
  if (record.funding_status === "refunding" || record.funding_status === "refunded") {
    return { ok: false, error: "This content payment was refunded" };
  }
  if (record.paused_at) return { ok: false, error: "This creator payment is paused" };

  const chargeCents = labelChargeCents(record.amount_cents);
  const card = await companyDefaultPaymentMethod(record.company_id);
  if (!card) {
    return {
      ok: false,
      error: `Add a card in Payments first. Approving this content charges ${formatCents(chargeCents)} (the creator's ${formatCents(record.amount_cents)} plus card processing).`,
    };
  }

  const claimedRows = check(
    await db.rpc("claim_funding", { p_record_id: record.id, p_method_id: card.id, p_amount_cents: chargeCents }),
    "claim funding",
  );
  const claimed = (claimedRows ?? [])[0] as FundingRow | undefined;
  if (!claimed) return { ok: false, error: "This creator payment can't be charged right now" };
  const key = claimed.funding_key!;

  const op = await startOperation({ kind: "charge", idempotencyKey: key, paymentRecordId: claimed.id, actor });
  await checkpoint("funding.before_provider");
  const result = await paymentProvider().charge({
    providerMethodId: card.provider_method_id,
    amountCents: claimed.funding_amount_cents!,
    idempotencyKey: key,
    metadata: { bookingId, paymentRecordId: claimed.id, attemptKey: key, kind: "content_funding" },
    transferGroup: claimed.id,
  });
  await checkpoint("funding.after_provider");
  const finished = await finishFunding(claimed, op.id, result, actor);
  if (!finished.ok) {
    return {
      ok: false,
      error: `Your card ending ${card.last4} was declined (${finished.error}). Update it in Payments, then approve again.`,
    };
  }
  return { ok: true, chargedCents: claimed.funding_amount_cents! };
}

export async function finishFunding(
  claimed: FundingRow,
  operationId: string,
  result: ChargeResult,
  actor: Actor,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = serviceDb();
  const key = claimed.funding_key!;
  if (!result.ok) {
    check(
      await db
        .from("creator_payment_records")
        .update({
          funding_status: "failed",
          funding_failure: result.failureReason,
          funding_intent_id: result.providerIntentId ?? null,
          funding_lease_until: null,
        })
        .eq("id", claimed.id)
        .eq("funding_status", "charging")
        .eq("funding_key", key),
      "record failed label charge",
    );
    await finishOperation(operationId, { status: "failed", error: result.failureReason });
    return { ok: false, error: result.failureReason };
  }

  const charged = check(
    await db
      .from("creator_payment_records")
      .update({
        funding_status: "charged",
        funding_intent_id: result.providerIntentId,
        funding_charge_id: result.providerChargeId,
        funded_at: new Date().toISOString(),
        funding_lease_until: null,
      })
      .eq("id", claimed.id)
      .eq("funding_status", "charging")
      .eq("funding_key", key)
      .select("id")
      .maybeSingle(),
    "finalize label charge",
  );
  await finishOperation(operationId, { status: "succeeded", providerRef: result.providerIntentId });
  if (charged) {
    await audit({
      actorId: actor.id,
      actorRole: actor.role,
      action: "creator_payment.funded",
      entityType: "creator_payment_record",
      entityId: claimed.id,
      companyId: claimed.company_id,
      metadata: { amountCents: claimed.funding_amount_cents, creatorFeeCents: claimed.amount_cents, intentId: result.providerIntentId },
    });
  }
  return { ok: true };
}

/**
 * Charge the label if needed, then pay the creator. For retries and admin
 * payouts (dispute resolved for the creator, payout retried after a failure).
 */
export async function fundAndPayout(
  bookingId: string,
  actor: Actor,
): Promise<{ ok: true; amountCents: number } | { ok: false; error: string }> {
  const funded = await fundCreatorPayment(bookingId, actor);
  if (!funded.ok) return funded;
  return payoutCreatorPayment(bookingId, actor);
}

/** Settle a label charge a crash left in 'charging' (its lease expired). */
export async function recoverFunding(id: string): Promise<boolean> {
  const db = serviceDb();
  const rec = check(
    await db
      .from("creator_payment_records")
      .update({ funding_lease_until: leaseUntil() })
      .eq("id", id)
      .eq("funding_status", "charging")
      .lt("funding_lease_until", new Date().toISOString())
      .select("id, booking_id, company_id, amount_cents, funding_amount_cents, funding_key, funding_intent_id, funding_method_id")
      .maybeSingle(),
    "re-lease label charge",
  );
  if (!rec) return false;
  const key = rec.funding_key!;
  const op = await latestOperation("charge", { idempotencyKey: key });
  if (!op) {
    // Never reached the provider: back to chargeable.
    check(
      await db
        .from("creator_payment_records")
        .update({ funding_status: "unfunded", funding_lease_until: null })
        .eq("id", rec.id)
        .eq("funding_status", "charging"),
      "restore uncharged funding",
    );
    return true;
  }
  const seen = await paymentProvider().lookupCharge({ paymentRecordId: rec.id, attemptKey: key });
  if (seen.found && seen.state === "processing") return false; // still settling; next sweep
  if (seen.found) {
    await finishFunding(
      rec,
      op.id,
      seen.state === "succeeded"
        ? { ok: true, providerIntentId: seen.intentId, providerChargeId: seen.chargeId }
        : { ok: false, failureReason: seen.failureReason ?? "Card was declined", providerIntentId: seen.intentId },
      SYSTEM,
    );
    return true;
  }
  if (Date.now() - new Date(op.created_at).getTime() > REPLAY_WINDOW_MS) {
    await finishFunding(rec, op.id, { ok: false, failureReason: "The charge was interrupted; approve again" }, SYSTEM);
    return true;
  }
  const { data: card } = rec.funding_method_id
    ? await db.from("payment_methods").select("provider_method_id").eq("id", rec.funding_method_id).maybeSingle()
    : { data: null };
  const result: ChargeResult = card
    ? await paymentProvider().charge({
        providerMethodId: card.provider_method_id,
        amountCents: rec.funding_amount_cents!,
        idempotencyKey: key,
        metadata: { bookingId: rec.booking_id, paymentRecordId: rec.id, attemptKey: key, kind: "content_funding" },
        transferGroup: rec.id,
      })
    : { ok: false, failureReason: "The card was removed before the charge finished" };
  await finishFunding(rec, op.id, result, SYSTEM);
  return true;
}

// ── Refunds ─────────────────────────────────────────────────────────────

/**
 * Give the label its money back when a charged creator payment is canceled
 * (booking canceled, dispute decided against payment, payout canceled).
 */
export async function refundFunding(recordId: string, actor: Actor = SYSTEM): Promise<boolean> {
  const db = serviceDb();
  const claimedRows = check(await db.rpc("claim_refund", { p_record_id: recordId }), "claim refund");
  const claimed = (claimedRows ?? [])[0] as FundingRow | undefined;
  if (!claimed) return false;
  const key = `refund:${claimed.id}`;
  const op = await startOperation({ kind: "refund", idempotencyKey: key, paymentRecordId: claimed.id, actor });
  await checkpoint("refund.before_provider");
  const result = await paymentProvider().refund({ providerIntentId: claimed.funding_intent_id!, idempotencyKey: key });
  await finishRefund(claimed, op.id, result, actor);
  return true;
}

async function finishRefund(claimed: FundingRow, operationId: string, result: RefundResult, actor: Actor) {
  const db = serviceDb();
  if (!result.ok) {
    // Back to charged: the next sweep tries again.
    check(
      await db
        .from("creator_payment_records")
        .update({ funding_status: "charged", funding_failure: result.failureReason, funding_lease_until: null })
        .eq("id", claimed.id)
        .eq("funding_status", "refunding"),
      "record failed refund",
    );
    await finishOperation(operationId, { status: "failed", error: result.failureReason });
    throw new Error(`refund failed: ${result.failureReason}`);
  }
  const refunded = check(
    await db
      .from("creator_payment_records")
      .update({ funding_status: "refunded", refunded_at: new Date().toISOString(), funding_lease_until: null })
      .eq("id", claimed.id)
      .eq("funding_status", "refunding")
      .select("id")
      .maybeSingle(),
    "finalize refund",
  );
  await finishOperation(operationId, { status: "succeeded", providerRef: result.providerRefundId });
  if (!refunded) return;
  await notifyCompany(claimed.company_id, {
    type: "authorization_released",
    title: `${formatCents(claimed.funding_amount_cents ?? claimed.amount_cents)} refunded to your card`,
    body: "A creator payment you had paid for was canceled, so the charge was refunded.",
    link: `/label/bookings/${claimed.booking_id}`,
    dedupeKey: `refund:${claimed.id}`,
  });
  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "creator_payment.refunded",
    entityType: "creator_payment_record",
    entityId: claimed.id,
    companyId: claimed.company_id,
    metadata: { amountCents: claimed.funding_amount_cents },
  });
}

/** A refund a crash left in 'refunding': replay it with the same key (refunds are idempotent). */
export async function recoverRefund(id: string): Promise<boolean> {
  const db = serviceDb();
  const rec = check(
    await db
      .from("creator_payment_records")
      .update({ funding_lease_until: leaseUntil() })
      .eq("id", id)
      .eq("funding_status", "refunding")
      .lt("funding_lease_until", new Date().toISOString())
      .select("id, booking_id, company_id, amount_cents, funding_amount_cents, funding_key, funding_intent_id")
      .maybeSingle(),
    "re-lease refund",
  );
  if (!rec) return false;
  const key = `refund:${rec.id}`;
  const op = await startOperation({ kind: "refund", idempotencyKey: key, paymentRecordId: rec.id, actor: SYSTEM });
  const result = await paymentProvider().refund({ providerIntentId: rec.funding_intent_id!, idempotencyKey: key });
  await finishRefund(rec, op.id, result, SYSTEM);
  return true;
}
