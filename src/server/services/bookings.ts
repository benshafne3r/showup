import "server-only";

import { serviceDb } from "@/server/db/service";
import { paymentProvider } from "@/server/providers/payment";
import { audit } from "./audit";
import { notify } from "./notifications";
import {
  agencyDefaultPaymentMethod,
  defaultPaymentMethod,
  placeAuthorization,
} from "./payments";
import { getPlatformSettings } from "./settings";
import { formatShowDate } from "@/lib/dates";
import { runOutboxNow, type OutboxJob } from "@/server/jobs/queue";
import { keysOf, notifyCompanyJob, notifyJob, releaseHoldsJob } from "@/server/jobs/outbox";

export const TERMS_VERSION = "2026-07-v1";

/** An agency accepting for a creator on its roster: the hold goes on its card. */
export type AgencyPayer = { agencyId: string; agencyName: string; actorId: string };

type Actor = { id: string | null; role: string };

/** Turn a transition function's error code into a message (null = unexpected). */
function txError(error: { message: string } | null, codes: Record<string, string>): string | null {
  if (!error) return null;
  for (const [code, message] of Object.entries(codes)) if (error.message.includes(code)) return message;
  throw new Error(error.message);
}

/**
 * Booking acceptance: the creator (or their agency, with `agency`) has
 * reviewed the final terms, has a verified card on file, and explicitly
 * consented to the temporary hold. One transaction (accept_booking_tx)
 * confirms the booking, opens the payment record and schedules the hold;
 * the hold itself is placed after commit if it's already due. Callers check
 * the agency represents the creator before passing `agency`.
 */
export async function acceptBooking(input: {
  creatorId: string;
  bookingId: string;
  agreedToTerms: boolean;
  agency?: AgencyPayer;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.agreedToTerms) {
    return { ok: false, error: "You must agree to the temporary hold terms to continue" };
  }
  const db = serviceDb();
  const { data: booking } = await db
    .from("bookings")
    .select("id, status, creator_id, company_id, acceptance_deadline_at, shows(date, artists(name)), users:users!creator_id(full_name)")
    .eq("id", input.bookingId)
    .eq("creator_id", input.creatorId)
    .single();
  if (!booking) return { ok: false, error: "Booking not found" };

  if (new Date(booking.acceptance_deadline_at) < new Date() &&
      ["awaiting_acceptance", "awaiting_payment_method"].includes(booking.status)) {
    await expireBooking(booking.id);
    return { ok: false, error: "The 24-hour acceptance window has passed" };
  }

  const pm = input.agency
    ? await agencyDefaultPaymentMethod(input.agency.agencyId)
    : await defaultPaymentMethod(input.creatorId);
  if (!pm && input.agency) {
    return { ok: false, error: `Add a card for ${input.agency.agencyName} in Payments first` };
  }
  if (!pm) {
    await db
      .from("bookings")
      .update({ status: "awaiting_payment_method" })
      .eq("id", booking.id)
      .eq("status", "awaiting_acceptance");
    return { ok: false, error: "Add a verified payment method first" };
  }

  const settings = await getPlatformSettings();
  const scheduledFor = new Date(`${booking.shows!.date}T00:00:00Z`);
  scheduledFor.setUTCDate(scheduledFor.getUTCDate() - settings.authorizationWindowDays);
  const due = scheduledFor.getTime() <= Date.now();

  const artistName = booking.shows?.artists?.name ?? "the show";
  const creatorName = booking.users?.full_name || "A creator";
  const jobs: OutboxJob[] = [
    notifyJob(`booking:${booking.id}:confirmed`, {
      userId: booking.creator_id,
      type: "booking_confirmed",
      title: `You're going to ${artistName}!`,
      body: due
        ? "Your booking is confirmed and the temporary hold is being placed now. Attend the show and it will be released."
        : "Your booking is confirmed. The temporary hold will be placed on your card a couple of days before the show. We'll let you know.",
      link: `/creator/bookings/${booking.id}`,
    }, booking.company_id),
    notifyCompanyJob(`booking:${booking.id}:confirmed:label`, booking.company_id, {
      type: "booking_confirmed",
      title: input.agency ? `${input.agency.agencyName} confirmed ${creatorName}` : "Creator secured their booking",
      body: input.agency
        ? `${input.agency.agencyName} confirmed ${creatorName}'s spot for ${artistName}. Send ticket instructions when ready.`
        : `A creator confirmed their spot for ${artistName}. Send ticket instructions when ready.`,
      link: `/label/bookings/${booking.id}`,
    }),
  ];

  const { data: authId, error } = await db.rpc("accept_booking_tx", {
    p_booking_id: booking.id,
    p_creator_id: input.creatorId,
    p_hold_agency_id: (input.agency?.agencyId ?? null) as string,
    p_payment_method_id: pm.id,
    p_provider: paymentProvider().name,
    p_terms_version: TERMS_VERSION,
    p_scheduled_for: scheduledFor.toISOString(),
    p_jobs: jobs as never,
  });
  const failure = txError(error, {
    booking_not_found: "Booking not found",
    not_acceptable: "Booking can no longer be accepted",
    acceptance_expired: "The 24-hour acceptance window has passed",
  });
  if (failure) return { ok: false, error: failure };

  await runOutboxNow(keysOf(jobs));
  // Placing the hold calls the provider, so it happens after commit. A
  // decline leaves the booking confirmed with a grace period to fix the card.
  if (due) await placeAuthorization(authId as string);

  await audit({
    actorId: input.agency?.actorId ?? input.creatorId,
    actorRole: input.agency ? "manager" : "creator",
    action: "booking.accept",
    entityType: "booking",
    entityId: booking.id,
    companyId: booking.company_id,
    metadata: { termsVersion: TERMS_VERSION, holdDueNow: due, holdAgencyId: input.agency?.agencyId ?? null },
  });
  return { ok: true };
}

const CANCELLABLE = [
  "awaiting_acceptance",
  "awaiting_payment_method",
  "confirmed",
  "authorization_failed",
  "no_show_review",
  "disputed",
];
const AWAITING = ["awaiting_acceptance", "awaiting_payment_method"];

/**
 * Close out a booking in one transaction (cancel_booking_tx): inventory back,
 * tickets and pending payment canceled, unplaced holds canceled, plus the
 * jobs for notifications and releasing any active hold, so none of that can
 * be lost if the process dies right after.
 */
async function closeBooking(input: {
  bookingId: string;
  reason: string;
  from: string[];
  requestStatus: "expired" | "withdrawn" | null;
  jobs: (b: { creatorId: string; companyId: string }) => OutboxJob[];
  actor: Actor;
}): Promise<{ ok: true; creatorId: string; companyId: string } | { ok: false; error: string }> {
  const db = serviceDb();
  const { data: before } = await db
    .from("bookings")
    .select("creator_id, company_id")
    .eq("id", input.bookingId)
    .maybeSingle();
  if (!before) return { ok: false, error: "Booking not found" };
  const jobs = [
    releaseHoldsJob(input.bookingId, input.actor, before.company_id),
    ...input.jobs({ creatorId: before.creator_id, companyId: before.company_id }),
  ];
  const { error } = await db.rpc("cancel_booking_tx", {
    p_booking_id: input.bookingId,
    p_reason: input.reason,
    p_from: input.from,
    p_request_status: (input.requestStatus ?? null) as string,
    p_jobs: jobs as never,
  });
  const failure = txError(error, { not_cancellable: "Booking cannot be canceled in its current state" });
  if (failure) return { ok: false, error: failure };
  await runOutboxNow(keysOf(jobs));
  return { ok: true, creatorId: before.creator_id, companyId: before.company_id };
}

/**
 * The agency passes on an approved booking or label invite for its creator:
 * the spot goes back to the label's pool and the label is told.
 */
export async function passOnBooking(input: {
  bookingId: string;
  agency: AgencyPayer;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: b } = await serviceDb()
    .from("bookings")
    .select("users:users!creator_id(full_name), shows(date, artists(name))")
    .eq("id", input.bookingId)
    .maybeSingle();
  const creatorName = b?.users?.full_name || "Their creator";
  const artistName = b?.shows?.artists?.name ?? "the show";
  const closed = await closeBooking({
    bookingId: input.bookingId,
    reason: "declined",
    from: AWAITING,
    requestStatus: "withdrawn",
    actor: { id: input.agency.actorId, role: "manager" },
    jobs: ({ companyId }) => [
      notifyCompanyJob(`booking:${input.bookingId}:declined`, companyId, {
        type: "booking_canceled",
        title: `${input.agency.agencyName} passed on ${artistName}`,
        body: `${creatorName} can't make it to ${artistName}${b?.shows?.date ? ` on ${formatShowDate(b.shows.date)}` : ""}. The ticket is back in your pool.`,
        link: `/label/bookings/${input.bookingId}`,
      }),
    ],
  });
  if (!closed.ok) return { ok: false, error: "This offer can no longer be declined" };
  await audit({
    actorId: input.agency.actorId,
    actorRole: "manager",
    action: "booking.decline",
    entityType: "booking",
    entityId: input.bookingId,
    companyId: closed.companyId,
    metadata: { agencyId: input.agency.agencyId },
  });
  return { ok: true };
}

/** Expire a booking whose acceptance window lapsed; releases inventory. */
export async function expireBooking(bookingId: string): Promise<boolean> {
  const closed = await closeBooking({
    bookingId,
    reason: "acceptance_expired",
    from: AWAITING,
    requestStatus: "expired",
    actor: { id: null, role: "system" },
    jobs: ({ creatorId }) => [
      notifyJob(`booking:${bookingId}:expired`, {
        userId: creatorId,
        type: "booking_canceled",
        title: "Your approval expired",
        body: "The 24-hour acceptance window passed, so the spot was released. You can request other shows anytime.",
        link: "/creator/messages?tab=requests",
      }),
    ],
  });
  if (!closed.ok) return false;
  await audit({ action: "booking.expire", entityType: "booking", entityId: bookingId, companyId: closed.companyId });
  return true;
}

/**
 * Cancel a booking (label, admin, or system). Releases inventory, cancels or
 * releases any hold, and cancels a pending creator payment.
 */
export async function cancelBooking(input: {
  bookingId: string;
  actor: Actor;
  reason: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const closed = await closeBooking({
    bookingId: input.bookingId,
    reason: input.reason,
    from: CANCELLABLE,
    requestStatus: null,
    actor: input.actor,
    jobs: ({ creatorId }) => [
      notifyJob(`booking:${input.bookingId}:canceled`, {
        userId: creatorId,
        type: "booking_canceled",
        title: "Your booking was canceled",
        body: `Reason: ${input.reason}. Any temporary hold has been released.`,
        link: `/creator/bookings/${input.bookingId}`,
      }),
    ],
  });
  if (!closed.ok) return closed;
  await audit({
    actorId: input.actor.id,
    actorRole: input.actor.role,
    action: "booking.cancel",
    entityType: "booking",
    entityId: input.bookingId,
    companyId: closed.companyId,
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
