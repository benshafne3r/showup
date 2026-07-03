import "server-only";

import { serviceDb } from "@/server/db/service";
import { audit } from "./audit";
import { notify, notifyCompany } from "./notifications";
import {
  cancelAuthorizationForBooking,
  defaultPaymentMethod,
  scheduleAuthorizationForBooking,
} from "./payments";

export const TERMS_VERSION = "2026-07-v1";

/**
 * Booking acceptance: the creator has reviewed the final terms breakdown,
 * added a verified payment method, and explicitly consented to the temporary
 * authorization. Confirms the booking and schedules (or places) the hold.
 */
export async function acceptBooking(input: {
  creatorId: string;
  bookingId: string;
  agreedToTerms: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.agreedToTerms) {
    return { ok: false, error: "You must agree to the temporary hold terms to continue" };
  }
  const db = serviceDb();

  const { data: booking } = await db
    .from("bookings")
    .select("id, status, creator_id, company_id, acceptance_deadline_at, authorization_amount_cents, creator_payment_cents, shows(date, artists(name))")
    .eq("id", input.bookingId)
    .eq("creator_id", input.creatorId)
    .single();
  if (!booking) return { ok: false, error: "Booking not found" };

  if (new Date(booking.acceptance_deadline_at) < new Date() &&
      ["awaiting_acceptance", "awaiting_payment_method"].includes(booking.status)) {
    await expireBooking(booking.id);
    return { ok: false, error: "The 24-hour acceptance window has passed" };
  }

  const pm = await defaultPaymentMethod(input.creatorId);
  if (!pm) {
    await db
      .from("bookings")
      .update({ status: "awaiting_payment_method" })
      .eq("id", booking.id)
      .eq("status", "awaiting_acceptance");
    return { ok: false, error: "Add a verified payment method first" };
  }

  // Claim the acceptance (idempotent under double-submit).
  const { data: claimed } = await db
    .from("bookings")
    .update({
      status: "confirmed",
      accepted_at: new Date().toISOString(),
      terms_accepted_at: new Date().toISOString(),
      terms_version: TERMS_VERSION,
    })
    .eq("id", booking.id)
    .in("status", ["awaiting_acceptance", "awaiting_payment_method"])
    .select("id")
    .maybeSingle();
  if (!claimed) return { ok: false, error: "Booking can no longer be accepted" };

  // Creator payment record (payout ledger) — created up front so both sides
  // can track it; not_required when the opportunity pays $0.
  await db.from("creator_payment_records").upsert(
    {
      booking_id: booking.id,
      creator_id: booking.creator_id,
      company_id: booking.company_id,
      status: booking.creator_payment_cents > 0 ? "pending_fulfillment" : "not_required",
      amount_cents: booking.creator_payment_cents,
      provider: pm.provider as "mock" | "stripe",
    },
    { onConflict: "booking_id" },
  );

  const scheduled = await scheduleAuthorizationForBooking(booking.id);
  if (!scheduled.ok) {
    // Roll back so the creator can retry once the issue is fixed.
    await db
      .from("bookings")
      .update({ status: "awaiting_payment_method", accepted_at: null, terms_accepted_at: null, terms_version: null })
      .eq("id", booking.id)
      .eq("status", "confirmed");
    return { ok: false, error: scheduled.error };
  }

  const artistName = booking.shows?.artists?.name ?? "the show";
  await notify({
    userId: booking.creator_id,
    type: "booking_confirmed",
    title: `You're going to ${artistName}!`,
    body: scheduled.placed
      ? "Your booking is confirmed and the temporary hold has been placed. Attend the show and it will be released."
      : "Your booking is confirmed. The temporary hold will be placed on your card a few days before the show — we'll let you know.",
    link: `/creator/bookings/${booking.id}`,
  });
  await notifyCompany(booking.company_id, {
    type: "booking_confirmed",
    title: "Creator secured their booking",
    body: `A creator confirmed their spot for ${artistName}. Send ticket instructions when ready.`,
    link: `/label/bookings/${booking.id}`,
  });
  await audit({
    actorId: input.creatorId,
    actorRole: "creator",
    action: "booking.accept",
    entityType: "booking",
    entityId: booking.id,
    companyId: booking.company_id,
    metadata: { termsVersion: TERMS_VERSION, holdPlacedImmediately: scheduled.placed },
  });
  return { ok: true };
}

/** Expire a booking whose acceptance window lapsed; releases inventory. */
export async function expireBooking(bookingId: string): Promise<boolean> {
  const db = serviceDb();
  const { data: claimed } = await db
    .from("bookings")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
      cancel_reason: "acceptance_expired",
    })
    .eq("id", bookingId)
    .in("status", ["awaiting_acceptance", "awaiting_payment_method"])
    .select("id, request_id, opportunity_id, creator_id, company_id, ticket_count")
    .maybeSingle();
  if (!claimed) return false;

  await db
    .from("show_requests")
    .update({ status: "expired", expired_at: new Date().toISOString() })
    .eq("id", claimed.request_id)
    .eq("status", "approved");
  await db.rpc("release_tickets", {
    p_opportunity_id: claimed.opportunity_id,
    p_count: claimed.ticket_count,
  });
  await db
    .from("booking_tickets")
    .update({ status: "canceled" })
    .eq("booking_id", claimed.id);

  await notify({
    userId: claimed.creator_id,
    type: "booking_canceled",
    title: "Your approval expired",
    body: "The 24-hour acceptance window passed, so the spot was released. You can request other shows anytime.",
    link: "/creator/requests",
  });
  await audit({
    action: "booking.expire",
    entityType: "booking",
    entityId: claimed.id,
    companyId: claimed.company_id,
  });
  return true;
}

/**
 * Cancel a booking (label, admin, or system). Releases inventory, cancels or
 * releases any hold, and cancels a pending creator payment.
 */
export async function cancelBooking(input: {
  bookingId: string;
  actor: { id: string | null; role: string };
  reason: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = serviceDb();
  const { data: claimed } = await db
    .from("bookings")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
      cancel_reason: input.reason,
    })
    .eq("id", input.bookingId)
    .in("status", [
      "awaiting_acceptance",
      "awaiting_payment_method",
      "confirmed",
      "authorization_failed",
      "no_show_review",
      "disputed",
    ])
    .select("id, request_id, opportunity_id, creator_id, company_id, ticket_count, status")
    .maybeSingle();
  if (!claimed) return { ok: false, error: "Booking cannot be canceled in its current state" };

  await cancelAuthorizationForBooking(claimed.id, input.actor);
  await db
    .from("creator_payment_records")
    .update({ status: "canceled", canceled_at: new Date().toISOString() })
    .eq("booking_id", claimed.id)
    .in("status", ["awaiting_funding", "funded", "pending_fulfillment", "ready", "failed"]);
  await db.rpc("release_tickets", {
    p_opportunity_id: claimed.opportunity_id,
    p_count: claimed.ticket_count,
  });
  await db.from("booking_tickets").update({ status: "canceled" }).eq("booking_id", claimed.id);

  await notify({
    userId: claimed.creator_id,
    type: "booking_canceled",
    title: "Your booking was canceled",
    body: `Reason: ${input.reason}. Any temporary hold has been released.`,
    link: `/creator/bookings/${claimed.id}`,
  });
  await audit({
    actorId: input.actor.id,
    actorRole: input.actor.role,
    action: "booking.cancel",
    entityType: "booking",
    entityId: claimed.id,
    companyId: claimed.company_id,
    metadata: { reason: input.reason },
  });
  return { ok: true };
}

/** Lazy expiry on read: keeps UIs truthful even if the cron hasn't run. */
export async function expireIfOverdue(booking: {
  id: string;
  status: string;
  acceptance_deadline_at: string;
}): Promise<boolean> {
  if (
    ["awaiting_acceptance", "awaiting_payment_method"].includes(booking.status) &&
    new Date(booking.acceptance_deadline_at) < new Date()
  ) {
    return expireBooking(booking.id);
  }
  return false;
}

/** Send (or resend) ticket delivery instructions to the creator. */
export async function sendTicketInstructions(input: {
  bookingId: string;
  companyId: string;
  sender: { id: string; role: string };
  instructions: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = serviceDb();
  const { data: booking } = await db
    .from("bookings")
    .update({
      ticket_instructions: input.instructions,
      ticket_instructions_sent_at: new Date().toISOString(),
    })
    .eq("id", input.bookingId)
    .eq("company_id", input.companyId)
    .in("status", ["confirmed", "authorization_failed", "attended"])
    .select("id, creator_id, request_id")
    .maybeSingle();
  if (!booking) return { ok: false, error: "Booking is not in a state to receive instructions" };

  // Mirror into the message thread so instructions are always findable.
  const { data: thread } = await db
    .from("message_threads")
    .select("id")
    .eq("request_id", booking.request_id)
    .maybeSingle();
  if (thread) {
    await db.from("messages").insert({
      thread_id: thread.id,
      sender_id: input.sender.id,
      kind: "ticket_instructions",
      body: input.instructions,
    });
    await db
      .from("message_threads")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", thread.id);
  }
  await db
    .from("booking_tickets")
    .update({ status: "issued" })
    .eq("booking_id", booking.id)
    .eq("status", "reserved");

  await notify({
    userId: booking.creator_id,
    type: "ticket_instructions",
    title: "Your ticket instructions have arrived",
    body: "The artist team sent instructions for picking up your ticket.",
    link: `/creator/bookings/${booking.id}`,
  });
  await audit({
    actorId: input.sender.id,
    actorRole: input.sender.role,
    action: "booking.send_ticket_instructions",
    entityType: "booking",
    entityId: booking.id,
    companyId: input.companyId,
  });
  return { ok: true };
}
