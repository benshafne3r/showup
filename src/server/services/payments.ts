import "server-only";

import { serviceDb } from "@/server/db/service";
import { paymentProvider } from "@/server/providers/payment";
import type { CardInput, PaymentProvider } from "@/server/providers/payment/types";
import { audit } from "./audit";
import { notify } from "./notifications";
import { getPlatformSettings } from "./settings";
import { enforceRateLimit } from "./rate-limit";
import { payoutDestinationFor } from "./connect";
import { serverEnv } from "@/lib/env";
import { formatCents } from "@/lib/money";
import { fallbackHoldExpiry } from "@/lib/holds";
import { showIsOver } from "@/lib/dates";
import { log } from "@/server/log";
import { checkpoint } from "@/server/checkpoints";
import type { AuthorizationResult, CaptureResult, PayoutResult, ReleaseResult } from "@/server/providers/payment/types";
import {
  check,
  finishOperation,
  leaseUntil,
  operationCount,
  startOperation,
  type Actor,
} from "./payment-ledger";

/**
 * All money movement lives here. The rules that keep it safe:
 *  - Every provider mutation carries an idempotency key that is stored BEFORE
 *    the call (payment_operations), so a replay can never move money twice.
 *  - A record moves to an in-flight state (pending / releasing / capturing /
 *    paying) with a lease before the provider call, and to its final state
 *    only after the provider confirms. A crash leaves the in-flight state;
 *    payment-recovery.ts reconciles it with the provider once the lease
 *    expires.
 *  - Every transition is a status-guarded UPDATE, so concurrent capture /
 *    release / cancel / payout attempts serialize: exactly one wins.
 *  - Critical writes throw on error instead of continuing on stale state.
 */

// ── Payment methods ─────────────────────────────────────────────────────

export async function attachPaymentMethod(userId: string, card: CardInput) {
  await enforceRateLimit("payment_method.attach", userId);
  const provider = paymentProvider();
  const info = await provider.attachPaymentMethod(userId, card);
  return recordPaymentMethod(userId, provider.name, info);
}

/** PCI-safe path: the card was tokenized client-side (Stripe Elements). */
export async function attachPaymentMethodByToken(userId: string, paymentMethodId: string) {
  await enforceRateLimit("payment_method.attach", userId);
  const provider = paymentProvider();
  const info = await provider.attachPaymentMethodToken(userId, paymentMethodId);
  return recordPaymentMethod(userId, provider.name, info);
}

/**
 * An agency's card: covers ticket holds for the creators it accepts bookings
 * for. Saved under the manager who added it (their Stripe customer).
 */
export async function attachAgencyPaymentMethod(agencyId: string, userId: string, card: CardInput) {
  await enforceRateLimit("payment_method.attach", userId);
  const provider = paymentProvider();
  const info = await provider.attachPaymentMethod(userId, card);
  return recordPaymentMethod(userId, provider.name, info, agencyId);
}

export async function attachAgencyPaymentMethodByToken(agencyId: string, userId: string, paymentMethodId: string) {
  await enforceRateLimit("payment_method.attach", userId);
  const provider = paymentProvider();
  const info = await provider.attachPaymentMethodToken(userId, paymentMethodId);
  return recordPaymentMethod(userId, provider.name, info, agencyId);
}

async function recordPaymentMethod(
  userId: string,
  providerName: PaymentProvider["name"],
  info: Awaited<ReturnType<PaymentProvider["attachPaymentMethod"]>>,
  agencyId?: string,
) {
  if (!info.verified) {
    return { ok: false as const, error: info.failureReason ?? "Card verification failed" };
  }

  const provider = { name: providerName };
  const db = serviceDb();
  // Single default per user, or per agency for an agency card.
  if (agencyId) {
    await db.from("payment_methods").update({ is_default: false }).eq("agency_id", agencyId);
  } else {
    await db.from("payment_methods").update({ is_default: false }).eq("user_id", userId).is("agency_id", null);
  }
  const { data: row, error } = await db
    .from("payment_methods")
    .insert({
      user_id: userId,
      agency_id: agencyId ?? null,
      provider: provider.name,
      provider_method_id: info.providerMethodId,
      brand: info.brand,
      last4: info.last4,
      exp_month: info.expMonth,
      exp_year: info.expYear,
      verified_at: new Date().toISOString(),
      is_default: true,
    })
    .select("id, brand, last4")
    .single();
  if (error) return { ok: false as const, error: error.message };

  await audit({
    actorId: userId,
    actorRole: agencyId ? "manager" : "creator",
    action: "payment_method.attach",
    entityType: "payment_method",
    entityId: row.id,
    metadata: { brand: row.brand, last4: row.last4, provider: provider.name, agencyId: agencyId ?? null },
  });
  return { ok: true as const, paymentMethodId: row.id };
}

export async function defaultPaymentMethod(userId: string) {
  const { data } = await serviceDb()
    .from("payment_methods")
    .select("id, provider, provider_method_id, brand, last4, exp_month, exp_year, verified_at")
    .eq("user_id", userId)
    .is("agency_id", null)
    .eq("is_default", true)
    .not("verified_at", "is", null)
    .maybeSingle();
  return data;
}

export async function agencyDefaultPaymentMethod(agencyId: string) {
  const { data } = await serviceDb()
    .from("payment_methods")
    .select("id, provider, provider_method_id, brand, last4, exp_month, exp_year, verified_at")
    .eq("agency_id", agencyId)
    .eq("is_default", true)
    .not("verified_at", "is", null)
    .maybeSingle();
  return data;
}

/** The card a booking's hold goes on: the agency's when it accepted for its creator. */
async function holdPaymentMethod(booking: { creator_id: string; hold_agency_id: string | null }) {
  return booking.hold_agency_id
    ? agencyDefaultPaymentMethod(booking.hold_agency_id)
    : defaultPaymentMethod(booking.creator_id);
}

// ── Authorization lifecycle ─────────────────────────────────────────────

type AuthRow = {
  id: string;
  booking_id: string;
  creator_id: string;
  company_id: string;
  amount_cents: number;
  attempt_count: number;
  idempotency_key: string | null;
  provider_intent_id: string | null;
  payment_method_id: string | null;
};
const AUTH_COLUMNS =
  "id, booking_id, creator_id, company_id, amount_cents, attempt_count, idempotency_key, provider_intent_id, payment_method_id";

/**
 * Create the authorization record at booking confirmation. If the show is
 * already inside the authorization window the hold is placed immediately;
 * otherwise it is scheduled for (show date − window days, UTC).
 */
export async function scheduleAuthorizationForBooking(bookingId: string): Promise<
  | { ok: true; placed: boolean; scheduledFor: string }
  | { ok: false; error: string }
> {
  const db = serviceDb();
  const { data: booking } = await db
    .from("bookings")
    .select("id, creator_id, company_id, hold_agency_id, authorization_amount_cents, shows(date)")
    .eq("id", bookingId)
    .single();
  if (!booking) return { ok: false, error: "Booking not found" };

  const settings = await getPlatformSettings();
  const scheduledFor = new Date(`${booking.shows!.date}T00:00:00Z`);
  scheduledFor.setUTCDate(scheduledFor.getUTCDate() - settings.authorizationWindowDays);

  const pm = await holdPaymentMethod(booking);
  if (!pm) return { ok: false, error: "No verified payment method on file" };

  const { data: authRecord, error } = await db
    .from("authorization_records")
    .insert({
      booking_id: booking.id,
      creator_id: booking.creator_id,
      company_id: booking.company_id,
      payment_method_id: pm.id,
      status: "scheduled",
      amount_cents: booking.authorization_amount_cents,
      provider: paymentProvider().name,
      scheduled_for: scheduledFor.toISOString(),
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  if (scheduledFor.getTime() <= Date.now()) {
    const placed = await placeAuthorization(authRecord.id);
    // A decline leaves the booking confirmed with a failed hold and a grace
    // period to fix the card, so this still counts as scheduled, not placed.
    return { ok: true, placed: placed.ok, scheduledFor: scheduledFor.toISOString() };
  }
  return { ok: true, placed: false, scheduledFor: scheduledFor.toISOString() };
}

/**
 * Place a scheduled/failed authorization. The claim (claim_authorization)
 * atomically moves it to 'pending' with a lease and a fresh per-attempt
 * idempotency key, so two workers can never double-authorize, and a crash
 * after the provider call is recoverable with the same key.
 */
export async function placeAuthorization(
  authRecordId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = serviceDb();
  const { data: current } = await db
    .from("authorization_records")
    .select("status, booking_id")
    .eq("id", authRecordId)
    .maybeSingle();
  if (!current || !["scheduled", "failed"].includes(current.status)) {
    return { ok: false, error: "Authorization is not in a placeable state" };
  }
  // The card is fixed at claim time so a replay sends identical parameters.
  const { data: payer } = await db
    .from("bookings")
    .select("creator_id, hold_agency_id")
    .eq("id", current.booking_id)
    .single();
  const pm = payer ? await holdPaymentMethod(payer) : null;

  const claimedRows = check(
    // No card still claims the attempt, so the failure is recorded on it (SQL accepts null).
    await db.rpc("claim_authorization", { p_id: authRecordId, p_payment_method_id: (pm?.id ?? null) as string }),
    "claim authorization",
  );
  const claimed = (claimedRows ?? [])[0] as AuthRow | undefined;
  if (!claimed) return { ok: false, error: "Authorization is not in a placeable state" };
  const key = claimed.idempotency_key!;

  if (!pm) {
    await failAuthorization(claimed, "No verified payment method on file");
    return { ok: false, error: "No verified payment method on file" };
  }

  const op = await startOperation({ kind: "authorize", idempotencyKey: key, authorizationRecordId: claimed.id });
  await checkpoint("authorize.before_provider");
  const result = await paymentProvider().authorize({
    providerMethodId: pm.provider_method_id,
    amountCents: claimed.amount_cents,
    idempotencyKey: key,
    metadata: { bookingId: claimed.booking_id, authRecordId: claimed.id, attemptKey: key },
  });
  await checkpoint("authorize.after_provider");
  return finishAuthorization(claimed, op.id, result);
}

/**
 * Write the outcome of an authorize call (live, or replayed by recovery).
 * Guarded on the record still being this attempt's 'pending': if the booking
 * was canceled while the call was in flight, the new hold is voided.
 */
export async function finishAuthorization(
  claimed: AuthRow,
  operationId: string,
  result: AuthorizationResult,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = serviceDb();
  const key = claimed.idempotency_key!;
  if (!result.ok) {
    await failAuthorization(claimed, result.failureReason);
    await finishOperation(operationId, { status: "failed", error: result.failureReason });
    return { ok: false, error: result.failureReason };
  }

  const finalized = check(
    await db
      .from("authorization_records")
      .update({
        status: "authorized",
        provider_intent_id: result.providerIntentId,
        authorized_at: new Date().toISOString(),
        expires_at: result.expiresAt ?? fallbackHoldExpiry(new Date()).toISOString(),
        lease_until: null,
        failure_reason: null,
        grace_deadline_at: null,
      })
      .eq("id", claimed.id)
      .eq("status", "pending")
      .eq("idempotency_key", key)
      .select("id")
      .maybeSingle(),
    "finalize authorization",
  );

  if (!finalized) {
    const { data: now } = await db
      .from("authorization_records")
      .select("status, provider_intent_id")
      .eq("id", claimed.id)
      .single();
    if (now?.provider_intent_id === result.providerIntentId && now.status !== "pending") {
      // Someone else (recovery or a webhook) already recorded this same hold.
      await finishOperation(operationId, { status: "succeeded", providerRef: result.providerIntentId });
      return { ok: true };
    }
    // Canceled while we were placing it: don't leave a hold on the card.
    await voidHold(claimed.id, result.providerIntentId, `void:${key}`);
    await finishOperation(operationId, { status: "succeeded", providerRef: result.providerIntentId });
    return { ok: false, error: "The booking was canceled while the hold was being placed; the hold was voided" };
  }
  await finishOperation(operationId, { status: "succeeded", providerRef: result.providerIntentId });

  // Recover bookings that had previously failed.
  check(
    await db.from("bookings").update({ status: "confirmed" }).eq("id", claimed.booking_id).eq("status", "authorization_failed"),
    "recover booking after authorization",
  );
  await notify({
    userId: claimed.creator_id,
    type: "authorization_placed",
    title: "Temporary hold placed",
    body: `A temporary hold of ${formatCents(claimed.amount_cents)} is now on your card. Attend the show and it will be released. You won't be charged.`,
    link: `/creator/bookings/${claimed.booking_id}`,
  });
  await audit({
    action: "authorization.placed",
    entityType: "authorization_record",
    entityId: claimed.id,
    companyId: claimed.company_id,
    metadata: { amountCents: claimed.amount_cents, attempt: claimed.attempt_count },
  });
  return { ok: true };
}

/** Record a failed attempt (guarded on it still being this attempt) and start the grace period. */
async function failAuthorization(claimed: AuthRow, reason: string): Promise<void> {
  const db = serviceDb();
  const settings = await getPlatformSettings();
  const { data: booking } = await db.from("bookings").select("shows(date)").eq("id", claimed.booking_id).single();
  const showStart = booking?.shows?.date
    ? new Date(`${booking.shows.date}T00:00:00Z`)
    : new Date(Date.now() + 86_400_000);
  const grace = new Date(Math.min(Date.now() + settings.paymentMethodGraceDays * 86_400_000, showStart.getTime()));

  const failed = check(
    await db
      .from("authorization_records")
      .update({
        status: "failed",
        failed_at: new Date().toISOString(),
        failure_reason: reason,
        last_error: reason,
        grace_deadline_at: grace.toISOString(),
        lease_until: null,
      })
      .eq("id", claimed.id)
      .eq("status", "pending")
      .eq("idempotency_key", claimed.idempotency_key!)
      .select("id")
      .maybeSingle(),
    "record failed authorization",
  );
  if (!failed) return; // canceled meanwhile; nothing to tell anyone

  check(
    await db
      .from("bookings")
      .update({ status: "authorization_failed" })
      .eq("id", claimed.booking_id)
      .in("status", ["confirmed", "authorization_failed"]),
    "flag booking authorization failure",
  );
  await notify({
    userId: claimed.creator_id,
    type: "payment_method_problem",
    title: "We couldn't place the hold on your card",
    body: `${reason}. Update your payment method before ${grace.toLocaleDateString()} or your booking will be canceled.`,
    link: `/creator/bookings/${claimed.booking_id}`,
  });
  await audit({
    action: "authorization.failed",
    entityType: "authorization_record",
    entityId: claimed.id,
    companyId: claimed.company_id,
    metadata: { reason, attempt: claimed.attempt_count },
  });
}

/** Cancel a hold that must not exist (its booking was canceled mid-placement). */
export async function voidHold(authRecordId: string, providerIntentId: string, key: string): Promise<void> {
  const op = await startOperation({ kind: "void", idempotencyKey: key, authorizationRecordId: authRecordId });
  const result = await paymentProvider().release({ providerIntentId, idempotencyKey: key });
  check(
    await serviceDb()
      .from("authorization_records")
      .update({ provider_intent_id: providerIntentId })
      .eq("id", authRecordId)
      .is("provider_intent_id", null),
    "record voided hold",
  );
  await finishOperation(op.id, {
    status: result.ok ? "succeeded" : "failed",
    providerRef: providerIntentId,
    error: result.ok ? null : result.failureReason,
  });
  if (!result.ok) log.error("Could not void a hold for a canceled booking", { authRecordId, reason: result.failureReason });
}

/** Creator fixed their card → retry a failed authorization immediately. */
export async function retryAuthorizationForBooking(bookingId: string) {
  const { data: record } = await serviceDb()
    .from("authorization_records")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("status", "failed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!record) return { ok: false as const, error: "No failed authorization to retry" };
  return placeAuthorization(record.id);
}

type HeldRow = {
  id: string;
  booking_id: string;
  creator_id: string;
  company_id: string;
  amount_cents: number;
  provider_intent_id: string | null;
};
const HELD_COLUMNS = "id, booking_id, creator_id, company_id, amount_cents, provider_intent_id";

/**
 * Release an active hold. authorized → releasing (claimed, leased) →
 * released once the provider confirms; back to authorized if it refuses.
 * Idempotent: an already released / releasing / expired hold is fine.
 */
export async function releaseAuthorization(
  authRecordId: string,
  actor: Actor,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = serviceDb();
  const claimed = check(
    await db
      .from("authorization_records")
      .update({ status: "releasing", lease_until: leaseUntil(), last_error: null })
      .eq("id", authRecordId)
      .eq("status", "authorized")
      .select(HELD_COLUMNS)
      .maybeSingle(),
    "claim release",
  );
  if (!claimed) {
    const { data: current } = await db.from("authorization_records").select("status").eq("id", authRecordId).single();
    // Already done, or in flight elsewhere (recovery finishes it if that process died).
    if (current && ["released", "releasing", "expired"].includes(current.status)) return { ok: true };
    return { ok: false, error: `Cannot release a hold in status ${current?.status ?? "unknown"}` };
  }

  const key = `release:${claimed.id}:${(await operationCount("release", claimed.id)) + 1}`;
  const op = await startOperation({ kind: "release", idempotencyKey: key, authorizationRecordId: claimed.id, actor });
  await checkpoint("release.before_provider");
  const result = await paymentProvider().release({ providerIntentId: claimed.provider_intent_id!, idempotencyKey: key });
  await checkpoint("release.after_provider");
  return finishRelease(claimed, op.id, result, actor);
}

export async function finishRelease(
  claimed: HeldRow,
  operationId: string,
  result: ReleaseResult,
  actor: Actor,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = serviceDb();
  if (!result.ok) {
    // Find out why before deciding: the hold may already be gone or charged.
    const seen = await paymentProvider().lookupIntent({
      providerIntentId: claimed.provider_intent_id,
      authRecordId: claimed.id,
    });
    if (seen.found && seen.state === "canceled") return finishRelease(claimed, operationId, { ok: true }, actor);
    if (seen.found && seen.state === "succeeded") {
      await settleCaptured(claimed, seen.capturedCents, "releasing");
      await finishOperation(operationId, { status: "failed", error: "Hold had already been captured" });
      return { ok: false, error: "This hold was already charged" };
    }
    check(
      await db
        .from("authorization_records")
        .update({ status: "authorized", lease_until: null, last_error: result.failureReason })
        .eq("id", claimed.id)
        .eq("status", "releasing"),
      "roll back release",
    );
    await finishOperation(operationId, { status: "failed", error: result.failureReason });
    return { ok: false, error: result.failureReason };
  }

  const done = check(
    await db
      .from("authorization_records")
      .update({ status: "released", released_at: new Date().toISOString(), lease_until: null })
      .eq("id", claimed.id)
      .eq("status", "releasing")
      .select("id")
      .maybeSingle(),
    "finalize release",
  );
  await finishOperation(operationId, { status: "succeeded", providerRef: claimed.provider_intent_id });
  if (!done) return { ok: true }; // finalized by someone else already

  await notify({
    userId: claimed.creator_id,
    type: "authorization_released",
    title: "Your hold has been released",
    body: `The temporary hold of ${formatCents(claimed.amount_cents)} has been released. You were not charged.`,
    link: `/creator/bookings/${claimed.booking_id}`,
  });
  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "authorization.release",
    entityType: "authorization_record",
    entityId: claimed.id,
    companyId: claimed.company_id,
    metadata: { amountCents: claimed.amount_cents },
  });
  return { ok: true };
}

/**
 * Charge an active hold (no-show). Refused before the show is over and once
 * the hold has expired. authorized → capturing → captured on confirmation.
 */
export async function captureAuthorization(
  authRecordId: string,
  actor: Actor,
): Promise<{ ok: true; capturedCents: number } | { ok: false; error: string }> {
  const db = serviceDb();
  const { data: hold } = await db
    .from("authorization_records")
    .select("status, expires_at, bookings!inner(shows!inner(date))")
    .eq("id", authRecordId)
    .maybeSingle();
  if (!hold || hold.status !== "authorized") {
    return { ok: false, error: "Hold is not active (already released, captured, or never placed)" };
  }
  if (hold.expires_at && new Date(hold.expires_at) <= new Date()) {
    return { ok: false, error: "The hold expired before anyone charged it, so this no-show can't be charged" };
  }
  if (!showIsOver(hold.bookings.shows.date)) {
    return { ok: false, error: "A no-show can only be charged after the show is over" };
  }

  const claimed = check(
    await db
      .from("authorization_records")
      .update({ status: "capturing", lease_until: leaseUntil(), last_error: null })
      .eq("id", authRecordId)
      .eq("status", "authorized")
      .select(HELD_COLUMNS)
      .maybeSingle(),
    "claim capture",
  );
  if (!claimed) return { ok: false, error: "Hold is not active (already released, captured, or never placed)" };

  const key = `capture:${claimed.id}:${(await operationCount("capture", claimed.id)) + 1}`;
  const op = await startOperation({ kind: "capture", idempotencyKey: key, authorizationRecordId: claimed.id, actor });
  await checkpoint("capture.before_provider");
  const result = await paymentProvider().capture({
    providerIntentId: claimed.provider_intent_id!,
    amountCents: claimed.amount_cents,
    idempotencyKey: key,
  });
  await checkpoint("capture.after_provider");
  return finishCapture(claimed, op.id, result, actor);
}

export async function finishCapture(
  claimed: HeldRow,
  operationId: string,
  result: CaptureResult,
  actor: Actor,
): Promise<{ ok: true; capturedCents: number } | { ok: false; error: string }> {
  const db = serviceDb();
  if (!result.ok) {
    const seen = await paymentProvider().lookupIntent({
      providerIntentId: claimed.provider_intent_id,
      authRecordId: claimed.id,
    });
    if (seen.found && seen.state === "succeeded") {
      return finishCapture(claimed, operationId, { ok: true, capturedCents: seen.capturedCents }, actor);
    }
    if (seen.found && seen.state === "canceled") {
      // The network let the hold lapse (or it was released): nothing to charge.
      check(
        await db
          .from("authorization_records")
          .update({ status: "expired", released_at: new Date().toISOString(), lease_until: null, last_error: result.failureReason })
          .eq("id", claimed.id)
          .eq("status", "capturing"),
        "mark hold expired",
      );
      await finishOperation(operationId, { status: "failed", error: result.failureReason });
      return { ok: false, error: "The hold expired before it could be charged" };
    }
    check(
      await db
        .from("authorization_records")
        .update({ status: "authorized", lease_until: null, last_error: result.failureReason })
        .eq("id", claimed.id)
        .eq("status", "capturing"),
      "roll back capture",
    );
    await finishOperation(operationId, { status: "failed", error: result.failureReason });
    return { ok: false, error: result.failureReason };
  }

  const done = await settleCaptured(claimed, result.capturedCents, "capturing");
  await finishOperation(operationId, { status: "succeeded", providerRef: claimed.provider_intent_id });
  if (!done) return { ok: true, capturedCents: result.capturedCents };

  await notify({
    userId: claimed.creator_id,
    type: "authorization_captured",
    title: "Your card was charged for a missed show",
    body: `The temporary hold of ${formatCents(claimed.amount_cents)} was charged because attendance wasn't verified. If you believe this is a mistake, open a dispute from the booking page.`,
    link: `/creator/bookings/${claimed.booking_id}`,
  });
  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "authorization.capture",
    entityType: "authorization_record",
    entityId: claimed.id,
    companyId: claimed.company_id,
    metadata: { capturedCents: result.capturedCents },
  });
  return { ok: true, capturedCents: result.capturedCents };
}

/** Record a confirmed capture (guarded on the in-flight state). True if this call wrote it. */
async function settleCaptured(claimed: HeldRow, capturedCents: number, from: "capturing" | "releasing"): Promise<boolean> {
  const row = check(
    await serviceDb()
      .from("authorization_records")
      .update({
        status: "captured",
        captured_at: new Date().toISOString(),
        capture_amount_cents: capturedCents,
        lease_until: null,
      })
      .eq("id", claimed.id)
      .eq("status", from)
      .select("id")
      .maybeSingle(),
    "finalize capture",
  );
  return !!row;
}

/**
 * Holds lapse on their own (Visa after 4 days 18 hours). Once a hold is past
 * its expiry, mark it 'expired' so nobody tries to charge it, and make sure
 * it's gone at the provider. Nobody is charged: a no-show the label never
 * decided on simply lapses (Ben's rule, 2026-10-06).
 */
export async function expireLapsedHolds(): Promise<{ expired: number }> {
  const db = serviceDb();
  const now = new Date().toISOString();
  const lapsed = check(
    await db.from("authorization_records").select("id").eq("status", "authorized").lt("expires_at", now).limit(100),
    "load lapsed holds",
  );

  let expired = 0;
  for (const hold of lapsed ?? []) {
    // Claim first, so a concurrent capture or release can't race this.
    const claimed = check(
      await db
        .from("authorization_records")
        .update({ status: "expired", released_at: now })
        .eq("id", hold.id)
        .eq("status", "authorized")
        .select("id, company_id, amount_cents, provider_intent_id")
        .maybeSingle(),
      "expire hold",
    );
    if (!claimed) continue;
    expired++;
    if (claimed.provider_intent_id) {
      // Normally already canceled by the network; this cancels any that aren't.
      const result = await paymentProvider().release({
        providerIntentId: claimed.provider_intent_id,
        idempotencyKey: `expire:${claimed.id}`,
      });
      if (!result.ok) {
        log.error("Could not cancel an expired hold at the provider", {
          authRecordId: claimed.id,
          reason: result.failureReason,
        });
      }
    }
    await audit({
      action: "authorization.expired",
      entityType: "authorization_record",
      entityId: claimed.id,
      companyId: claimed.company_id,
      metadata: { amountCents: claimed.amount_cents },
    });
  }
  return { expired };
}

/**
 * Booking or show canceled: make sure no hold survives it. Active holds are
 * released; unplaced ones canceled. A hold being placed right now is canceled
 * too: the placing worker sees that and voids what it created (or, if it
 * died, recovery does).
 */
export async function cancelAuthorizationForBooking(
  bookingId: string,
  actor: Actor,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let outcome: { ok: true } | { ok: false; error: string } = { ok: true };
  const db = serviceDb();
  const records = check(
    await db
      .from("authorization_records")
      .select("id, status")
      .eq("booking_id", bookingId)
      .in("status", ["scheduled", "pending", "failed", "authorized"]),
    "load holds to cancel",
  );

  for (const record of records ?? []) {
    if (record.status === "authorized") {
      const released = await releaseAuthorization(record.id, actor);
      if (!released.ok) {
        log.error("Hold release failed during cancellation", { authRecordId: record.id, reason: released.error });
        outcome = released;
      }
    } else {
      check(
        await db
          .from("authorization_records")
          .update({ status: "canceled", canceled_at: new Date().toISOString(), lease_until: null })
          .eq("id", record.id)
          .in("status", ["scheduled", "pending", "failed"]),
        "cancel hold",
      );
    }
  }
  return outcome;
}

// ── Creator payment (payout) ────────────────────────────────────────────

type PayoutRow = { id: string; booking_id: string; creator_id: string; company_id: string; amount_cents: number; idempotency_key: string | null };

/**
 * Pay the creator (or their agency) for approved content. ready/failed →
 * paying (claimed with a per-attempt key, leased) → paid once the transfer is
 * confirmed. A crash leaves 'paying'; recovery finds the transfer by its
 * transfer group or replays the same key, so it can't pay twice.
 */
export async function payoutCreatorPayment(
  bookingId: string,
  actor: Actor,
): Promise<{ ok: true; amountCents: number } | { ok: false; error: string }> {
  const db = serviceDb();
  const { data: record } = await db
    .from("creator_payment_records")
    .select("id, creator_id, status, paused_at")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (!record || !["ready", "failed"].includes(record.status) || record.paused_at) {
    return { ok: false, error: "Creator payment is not ready to pay (or is paused)" };
  }

  // A managed creator is paid through their management company's account. In
  // Stripe mode we can only transfer to an account with active transfers, so
  // resolve it before claiming and fail cleanly if setup isn't finished.
  const destination = await payoutDestinationFor(record.creator_id);
  if (serverEnv.paymentProvider === "stripe" && !destination.accountId) {
    const reason = destination.agency
      ? `${destination.agency.name} (the creator's management) hasn't finished payout setup`
      : "Creator hasn't finished payout setup";
    check(
      await db
        .from("creator_payment_records")
        .update({ status: "failed", failed_at: new Date().toISOString(), failure_reason: reason })
        .eq("id", record.id)
        .in("status", ["ready", "failed"]),
      "record payout setup gap",
    );
    return { ok: false, error: reason };
  }

  const claimedRows = check(await db.rpc("claim_payout", { p_booking_id: bookingId }), "claim payout");
  const claimed = (claimedRows ?? [])[0] as PayoutRow | undefined;
  if (!claimed) return { ok: false, error: "Creator payment is not ready to pay (or is paused)" };
  const key = claimed.idempotency_key!;

  const op = await startOperation({ kind: "payout", idempotencyKey: key, paymentRecordId: claimed.id, actor });
  await checkpoint("payout.before_provider");
  const result = await paymentProvider().payout({
    creatorUserId: claimed.creator_id,
    amountCents: claimed.amount_cents,
    idempotencyKey: key,
    metadata: { bookingId, paymentRecordId: claimed.id, attemptKey: key },
    destinationAccountId: destination.accountId ?? undefined,
    transferGroup: claimed.id,
  });
  await checkpoint("payout.after_provider");
  return finishPayout(claimed, op.id, result, actor, destination.agency);
}

export async function finishPayout(
  claimed: PayoutRow,
  operationId: string,
  result: PayoutResult,
  actor: Actor,
  agency: { id: string; name: string } | null,
): Promise<{ ok: true; amountCents: number } | { ok: false; error: string }> {
  const db = serviceDb();
  const key = claimed.idempotency_key!;
  if (!result.ok) {
    check(
      await db
        .from("creator_payment_records")
        .update({
          status: "failed",
          failed_at: new Date().toISOString(),
          failure_reason: result.failureReason,
          last_error: result.failureReason,
          lease_until: null,
        })
        .eq("id", claimed.id)
        .eq("status", "paying")
        .eq("idempotency_key", key),
      "record failed payout",
    );
    await finishOperation(operationId, { status: "failed", error: result.failureReason });
    return { ok: false, error: result.failureReason };
  }

  const paid = check(
    await db
      .from("creator_payment_records")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        provider_transfer_id: result.providerTransferId,
        payee_agency_id: agency?.id ?? null,
        lease_until: null,
      })
      .eq("id", claimed.id)
      .eq("status", "paying")
      .eq("idempotency_key", key)
      .select("id")
      .maybeSingle(),
    "finalize payout",
  );
  await finishOperation(operationId, { status: "succeeded", providerRef: result.providerTransferId });
  if (!paid) return { ok: true, amountCents: claimed.amount_cents }; // finalized elsewhere

  await notify({
    userId: claimed.creator_id,
    type: "payment_released",
    title: agency ? `${formatCents(claimed.amount_cents)} paid to ${agency.name}` : `You've been paid ${formatCents(claimed.amount_cents)}`,
    body: agency
      ? "Your content payment was released to your management company. Nice work!"
      : "Your creator payment for completed deliverables has been released. Nice work!",
    link: `/creator/payments`,
  });
  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "creator_payment.payout",
    entityType: "creator_payment_record",
    entityId: claimed.id,
    companyId: claimed.company_id,
    metadata: { amountCents: claimed.amount_cents, payeeAgencyId: agency?.id ?? null },
  });
  return { ok: true, amountCents: claimed.amount_cents };
}
