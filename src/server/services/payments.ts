import "server-only";

import { serviceDb } from "@/server/db/service";
import { paymentProvider } from "@/server/providers/payment";
import type { CardInput } from "@/server/providers/payment/types";
import { audit } from "./audit";
import { notify } from "./notifications";
import { getPlatformSettings } from "./settings";
import { enforceRateLimit } from "./rate-limit";
import { formatCents } from "@/lib/money";

/**
 * All money movement lives here. Every provider mutation carries a
 * deterministic idempotency key, and every state transition is claimed with
 * a status-guarded UPDATE (affected-rows check) so duplicate approvals,
 * double releases, double captures, and double payouts are impossible even
 * under concurrent requests.
 */

// ── Payment methods ─────────────────────────────────────────────────────

export async function attachPaymentMethod(userId: string, card: CardInput) {
  await enforceRateLimit("payment_method.attach", userId);
  const provider = paymentProvider();
  const info = await provider.attachPaymentMethod(userId, card);
  if (!info.verified) {
    return { ok: false as const, error: info.failureReason ?? "Card verification failed" };
  }

  const db = serviceDb();
  // Single default per user (MVP keeps one active card).
  await db.from("payment_methods").update({ is_default: false }).eq("user_id", userId);
  const { data: row, error } = await db
    .from("payment_methods")
    .insert({
      user_id: userId,
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
    actorRole: "creator",
    action: "payment_method.attach",
    entityType: "payment_method",
    entityId: row.id,
    metadata: { brand: row.brand, last4: row.last4, provider: provider.name },
  });
  return { ok: true as const, paymentMethodId: row.id };
}

export async function defaultPaymentMethod(userId: string) {
  const { data } = await serviceDb()
    .from("payment_methods")
    .select("id, provider, provider_method_id, brand, last4, exp_month, exp_year, verified_at")
    .eq("user_id", userId)
    .eq("is_default", true)
    .not("verified_at", "is", null)
    .maybeSingle();
  return data;
}

// ── Authorization lifecycle ─────────────────────────────────────────────

/**
 * Create the authorization record at booking confirmation. If the show is
 * already inside the authorization window the hold is placed immediately;
 * otherwise it is scheduled for (show date − window days).
 */
export async function scheduleAuthorizationForBooking(bookingId: string): Promise<
  | { ok: true; placed: boolean; scheduledFor: string }
  | { ok: false; error: string }
> {
  const db = serviceDb();
  const { data: booking } = await db
    .from("bookings")
    .select("id, creator_id, company_id, authorization_amount_cents, shows(date)")
    .eq("id", bookingId)
    .single();
  if (!booking) return { ok: false, error: "Booking not found" };

  const settings = await getPlatformSettings();
  const showDate = new Date(`${booking.shows!.date}T00:00:00`);
  const scheduledFor = new Date(showDate);
  scheduledFor.setDate(scheduledFor.getDate() - settings.authorizationWindowDays);

  const pm = await defaultPaymentMethod(booking.creator_id);
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
    await placeAuthorization(authRecord.id);
    return { ok: true, placed: true, scheduledFor: scheduledFor.toISOString() };
  }
  return { ok: true, placed: false, scheduledFor: scheduledFor.toISOString() };
}

/**
 * Place a scheduled/failed authorization. Claims the record with a guarded
 * UPDATE first so two workers can never double-authorize.
 */
export async function placeAuthorization(authRecordId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const db = serviceDb();

  const { data: claimed } = await db
    .from("authorization_records")
    .update({ status: "pending" })
    .eq("id", authRecordId)
    .in("status", ["scheduled", "failed"])
    .select("id, booking_id, creator_id, company_id, amount_cents, attempt_count, payment_method_id")
    .maybeSingle();
  if (!claimed) return { ok: false, error: "Authorization is not in a placeable state" };

  const attempt = claimed.attempt_count + 1;
  const pm = await defaultPaymentMethod(claimed.creator_id);

  const fail = async (reason: string) => {
    const settings = await getPlatformSettings();
    const { data: booking } = await db
      .from("bookings")
      .select("shows(date)")
      .eq("id", claimed.booking_id)
      .single();
    const showDate = booking?.shows?.date
      ? new Date(`${booking.shows.date}T00:00:00`)
      : new Date(Date.now() + 86400000);
    const grace = new Date(
      Math.min(Date.now() + settings.paymentMethodGraceDays * 86400000, showDate.getTime()),
    );

    await db
      .from("authorization_records")
      .update({
        status: "failed",
        failed_at: new Date().toISOString(),
        failure_reason: reason,
        grace_deadline_at: grace.toISOString(),
        attempt_count: attempt,
      })
      .eq("id", authRecordId);
    await db
      .from("bookings")
      .update({ status: "authorization_failed" })
      .eq("id", claimed.booking_id)
      .in("status", ["confirmed", "authorization_failed"]);
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
      entityId: authRecordId,
      companyId: claimed.company_id,
      metadata: { reason, attempt },
    });
  };

  if (!pm) {
    await fail("No verified payment method on file");
    return { ok: false, error: "No verified payment method on file" };
  }

  const result = await paymentProvider().authorize({
    providerMethodId: pm.provider_method_id,
    amountCents: claimed.amount_cents,
    idempotencyKey: `auth:${claimed.booking_id}:attempt${attempt}`,
    metadata: { bookingId: claimed.booking_id, authRecordId },
  });

  if (!result.ok) {
    await fail(result.failureReason);
    return { ok: false, error: result.failureReason };
  }

  await db
    .from("authorization_records")
    .update({
      status: "authorized",
      provider_intent_id: result.providerIntentId,
      idempotency_key: `auth:${claimed.booking_id}:attempt${attempt}`,
      authorized_at: new Date().toISOString(),
      attempt_count: attempt,
      payment_method_id: pm.id,
      failure_reason: null,
      grace_deadline_at: null,
    })
    .eq("id", authRecordId);
  // Recover bookings that had previously failed.
  await db
    .from("bookings")
    .update({ status: "confirmed" })
    .eq("id", claimed.booking_id)
    .eq("status", "authorization_failed");

  await notify({
    userId: claimed.creator_id,
    type: "authorization_placed",
    title: "Temporary hold placed",
    body: `A temporary hold of ${formatCents(claimed.amount_cents)} is now on your card. Attend the show and it will be released — you won't be charged.`,
    link: `/creator/bookings/${claimed.booking_id}`,
  });
  await audit({
    action: "authorization.placed",
    entityType: "authorization_record",
    entityId: authRecordId,
    companyId: claimed.company_id,
    metadata: { amountCents: claimed.amount_cents, attempt },
  });
  return { ok: true };
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

export async function releaseAuthorization(
  authRecordId: string,
  actor: { id: string | null; role: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = serviceDb();
  // Claim first — a second concurrent release sees 0 rows and treats it as done.
  const { data: claimed } = await db
    .from("authorization_records")
    .update({ status: "released", released_at: new Date().toISOString() })
    .eq("id", authRecordId)
    .eq("status", "authorized")
    .select("id, booking_id, creator_id, company_id, amount_cents, provider_intent_id")
    .maybeSingle();
  if (!claimed) {
    const { data: current } = await db
      .from("authorization_records")
      .select("status")
      .eq("id", authRecordId)
      .single();
    if (current?.status === "released") return { ok: true }; // already done
    return { ok: false, error: `Cannot release a hold in status ${current?.status ?? "unknown"}` };
  }

  const result = await paymentProvider().release({
    providerIntentId: claimed.provider_intent_id!,
    idempotencyKey: `release:${authRecordId}`,
  });
  if (!result.ok) {
    // Roll the claim back so it can be retried.
    await db
      .from("authorization_records")
      .update({ status: "authorized", released_at: null })
      .eq("id", authRecordId)
      .eq("status", "released");
    return { ok: false, error: result.failureReason };
  }

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
    entityId: authRecordId,
    companyId: claimed.company_id,
    metadata: { amountCents: claimed.amount_cents },
  });
  return { ok: true };
}

export async function captureAuthorization(
  authRecordId: string,
  actor: { id: string | null; role: string },
): Promise<{ ok: true; capturedCents: number } | { ok: false; error: string }> {
  const db = serviceDb();
  const { data: claimed } = await db
    .from("authorization_records")
    .update({ status: "captured", captured_at: new Date().toISOString() })
    .eq("id", authRecordId)
    .eq("status", "authorized")
    .select("id, booking_id, creator_id, company_id, amount_cents, provider_intent_id")
    .maybeSingle();
  if (!claimed) {
    return { ok: false, error: "Hold is not active (already released, captured, or never placed)" };
  }

  const result = await paymentProvider().capture({
    providerIntentId: claimed.provider_intent_id!,
    amountCents: claimed.amount_cents,
    idempotencyKey: `capture:${authRecordId}`,
  });
  if (!result.ok) {
    await db
      .from("authorization_records")
      .update({ status: "authorized", captured_at: null })
      .eq("id", authRecordId)
      .eq("status", "captured");
    return { ok: false, error: result.failureReason };
  }

  await db
    .from("authorization_records")
    .update({ capture_amount_cents: result.capturedCents })
    .eq("id", authRecordId);
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
    entityId: authRecordId,
    companyId: claimed.company_id,
    metadata: { capturedCents: result.capturedCents },
  });
  return { ok: true, capturedCents: result.capturedCents };
}

/** Cancel a scheduled/failed/active authorization (booking or show canceled). */
export async function cancelAuthorizationForBooking(
  bookingId: string,
  actor: { id: string | null; role: string },
): Promise<void> {
  const db = serviceDb();
  const { data: records } = await db
    .from("authorization_records")
    .select("id, status")
    .eq("booking_id", bookingId)
    .in("status", ["scheduled", "pending", "failed", "authorized"]);

  for (const record of records ?? []) {
    if (record.status === "authorized") {
      await releaseAuthorization(record.id, actor);
    } else {
      await db
        .from("authorization_records")
        .update({ status: "canceled", canceled_at: new Date().toISOString() })
        .eq("id", record.id)
        .in("status", ["scheduled", "pending", "failed"]);
    }
  }
}

// ── Creator payment (payout) ────────────────────────────────────────────

export async function payoutCreatorPayment(
  bookingId: string,
  actor: { id: string | null; role: string },
): Promise<{ ok: true; amountCents: number } | { ok: false; error: string }> {
  const db = serviceDb();
  // Claim: only a record in `ready` (or retryable `failed`) can be paid.
  const { data: claimed } = await db
    .from("creator_payment_records")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("booking_id", bookingId)
    .in("status", ["ready", "failed"])
    .is("paused_at", null)
    .select("id, creator_id, company_id, amount_cents")
    .maybeSingle();
  if (!claimed) {
    return { ok: false, error: "Creator payment is not ready to pay (or is paused)" };
  }

  const result = await paymentProvider().payout({
    creatorUserId: claimed.creator_id,
    amountCents: claimed.amount_cents,
    idempotencyKey: `payout:${bookingId}`,
    metadata: { bookingId },
  });
  if (!result.ok) {
    await db
      .from("creator_payment_records")
      .update({
        status: "failed",
        paid_at: null,
        failed_at: new Date().toISOString(),
        failure_reason: result.failureReason,
      })
      .eq("id", claimed.id)
      .eq("status", "paid");
    return { ok: false, error: result.failureReason };
  }

  await db
    .from("creator_payment_records")
    .update({ provider_transfer_id: result.providerTransferId })
    .eq("id", claimed.id);
  await notify({
    userId: claimed.creator_id,
    type: "payment_released",
    title: `You've been paid ${formatCents(claimed.amount_cents)}`,
    body: "Your creator payment for completed deliverables has been released. Nice work!",
    link: `/creator/payments`,
  });
  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "creator_payment.payout",
    entityType: "creator_payment_record",
    entityId: claimed.id,
    companyId: claimed.company_id,
    metadata: { amountCents: claimed.amount_cents },
  });
  return { ok: true, amountCents: claimed.amount_cents };
}

// ── Webhooks ────────────────────────────────────────────────────────────

/**
 * Process a verified provider webhook. Events are deduplicated by id and
 * only ever advance state — the synchronous service path is the primary
 * writer, webhooks are the confirmation/backstop channel.
 */
export async function handleWebhookEvent(event: {
  id: string;
  type: string;
  data: Record<string, unknown>;
}): Promise<{ processed: boolean }> {
  const db = serviceDb();
  const { error: dedupeError } = await db.from("webhook_events").insert({
    id: event.id,
    provider: paymentProvider().name,
    type: event.type,
    payload: event.data as never,
  });
  if (dedupeError) return { processed: false }; // duplicate delivery

  // Reconcile: if the provider says an intent changed state but our record
  // is stale (e.g. process died mid-call), advance it.
  const intentId =
    (event.data.intentId as string | undefined) ??
    (event.data.id as string | undefined);
  if (intentId) {
    if (event.type === "authorization.succeeded") {
      await db
        .from("authorization_records")
        .update({ status: "authorized", authorized_at: new Date().toISOString() })
        .eq("provider_intent_id", intentId)
        .eq("status", "pending");
    } else if (event.type === "authorization.released") {
      await db
        .from("authorization_records")
        .update({ status: "released", released_at: new Date().toISOString() })
        .eq("provider_intent_id", intentId)
        .eq("status", "authorized");
    } else if (event.type === "authorization.captured") {
      await db
        .from("authorization_records")
        .update({ status: "captured", captured_at: new Date().toISOString() })
        .eq("provider_intent_id", intentId)
        .eq("status", "authorized");
    }
  }
  return { processed: true };
}
