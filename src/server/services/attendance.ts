import "server-only";

import { serviceDb } from "@/server/db/service";
import { audit } from "./audit";
import { notify, notifyCompany } from "./notifications";
import { releaseAuthorization, captureAuthorization } from "./payments";
import { uploadFile } from "./uploads";
import { isShowDay } from "@/lib/dates";

/**
 * MVP attendance verification: in-app check-in with photo proof, confirmed
 * by the label, disputes resolved by admins. Kept behind small functions so
 * QR-code / ticketing-provider / geolocation verification can be added as
 * alternative evidence sources later.
 */

export async function submitAttendance(input: {
  creatorId: string;
  bookingId: string;
  note: string;
  proofFiles: File[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = serviceDb();
  const { data: booking } = await db
    .from("bookings")
    .select("id, status, attendance_state, company_id, creator_id, shows(date, artists(name))")
    .eq("id", input.bookingId)
    .eq("creator_id", input.creatorId)
    .single();
  if (!booking) return { ok: false, error: "Booking not found" };
  if (!["confirmed", "authorization_failed", "no_show_review", "attended"].includes(booking.status)) {
    return { ok: false, error: "This booking isn't ready for check-in" };
  }
  if (!["not_started", "rejected"].includes(booking.attendance_state)) {
    return { ok: false, error: "Attendance proof was already submitted" };
  }
  if (!isShowDay(booking.shows!.date)) {
    return { ok: false, error: "Check-in opens on the day of the show" };
  }
  if (input.proofFiles.length === 0) {
    return { ok: false, error: "Attach at least one photo as attendance proof" };
  }

  const proofPaths: string[] = [];
  for (const file of input.proofFiles.slice(0, 3)) {
    proofPaths.push(await uploadFile("proofs", input.creatorId, file));
  }

  const { error } = await db.from("attendance_submissions").insert({
    booking_id: booking.id,
    creator_id: input.creatorId,
    company_id: booking.company_id,
    status: "submitted",
    proof_paths: proofPaths,
    note: input.note,
  });
  if (error) return { ok: false, error: error.message };

  await db
    .from("bookings")
    .update({ attendance_state: "submitted" })
    .eq("id", booking.id)
    .in("attendance_state", ["not_started", "rejected"]);

  await notifyCompany(booking.company_id, {
    type: "attendance_submitted",
    title: "Attendance proof submitted",
    body: `A creator checked in at ${booking.shows?.artists?.name ?? "a show"}. Review and confirm attendance to release their hold.`,
    link: `/label/bookings/${booking.id}`,
  });
  await audit({
    actorId: input.creatorId,
    actorRole: "creator",
    action: "attendance.submit",
    entityType: "booking",
    entityId: booking.id,
    companyId: booking.company_id,
  });
  return { ok: true };
}

/**
 * Label (or admin) confirms attendance → hold released, attendance complete,
 * booking moves to attended (or completed when no content is owed).
 */
export async function approveAttendance(input: {
  bookingId: string;
  reviewer: { id: string; role: string };
  companyId: string;
  reviewNote?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = serviceDb();

  const { data: submission } = await db
    .from("attendance_submissions")
    .update({
      status: "approved",
      reviewed_by: input.reviewer.id,
      reviewed_at: new Date().toISOString(),
      review_note: input.reviewNote ?? null,
    })
    .eq("booking_id", input.bookingId)
    .eq("company_id", input.companyId)
    .in("status", ["submitted", "disputed"])
    .select("id, booking_id, creator_id")
    .maybeSingle();
  if (!submission) return { ok: false, error: "No reviewable attendance submission found" };

  const { data: booking } = await db
    .from("bookings")
    .select("id, status, content_required, content_state, company_id, creator_id")
    .eq("id", input.bookingId)
    .single();
  if (!booking) return { ok: false, error: "Booking not found" };

  await db.from("bookings").update({ attendance_state: "approved" }).eq("id", booking.id);
  await db
    .from("booking_tickets")
    .update({ status: "used" })
    .eq("booking_id", booking.id)
    .in("status", ["reserved", "issued"]);

  // Release the hold — attendance is exactly what releases the creator.
  const { data: activeAuth } = await db
    .from("authorization_records")
    .select("id, status")
    .eq("booking_id", booking.id)
    .in("status", ["authorized", "scheduled", "pending", "failed"])
    .maybeSingle();
  if (activeAuth) {
    if (activeAuth.status === "authorized") {
      const released = await releaseAuthorization(activeAuth.id, input.reviewer);
      if (!released.ok) return { ok: false, error: `Attendance approved but hold release failed: ${released.error}` };
    } else {
      // Hold was never placed (early attendance approval) — cancel the schedule.
      await db
        .from("authorization_records")
        .update({ status: "canceled", canceled_at: new Date().toISOString() })
        .eq("id", activeAuth.id)
        .in("status", ["scheduled", "pending", "failed"]);
    }
  }

  const contentDone = !booking.content_required || booking.content_state === "approved";
  await db
    .from("bookings")
    .update(
      contentDone
        ? { status: "completed", completed_at: new Date().toISOString() }
        : { status: "attended" },
    )
    .eq("id", booking.id)
    .in("status", ["confirmed", "authorization_failed", "no_show_review", "disputed"]);

  if (booking.content_required && booking.content_state !== "approved") {
    await db
      .from("creator_payment_records")
      .update({ status: "pending_fulfillment" })
      .eq("booking_id", booking.id)
      .in("status", ["awaiting_funding", "funded"]);
  }

  await notify({
    userId: booking.creator_id,
    type: "attendance_approved",
    title: "Attendance verified — hold released",
    body: booking.content_required
      ? "Your attendance is confirmed and the hold is released. Submit your content to earn your creator payment."
      : "Your attendance is confirmed and the hold is released. You will not be charged.",
    link: `/creator/bookings/${booking.id}`,
  });
  await audit({
    actorId: input.reviewer.id,
    actorRole: input.reviewer.role,
    action: "attendance.approve",
    entityType: "booking",
    entityId: booking.id,
    companyId: booking.company_id,
  });
  return { ok: true };
}

export async function rejectAttendance(input: {
  bookingId: string;
  reviewer: { id: string; role: string };
  companyId: string;
  reviewNote: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = serviceDb();
  const { data: submission } = await db
    .from("attendance_submissions")
    .update({
      status: "rejected",
      reviewed_by: input.reviewer.id,
      reviewed_at: new Date().toISOString(),
      review_note: input.reviewNote,
    })
    .eq("booking_id", input.bookingId)
    .eq("company_id", input.companyId)
    .eq("status", "submitted")
    .select("id, creator_id")
    .maybeSingle();
  if (!submission) return { ok: false, error: "No reviewable attendance submission found" };

  await serviceDb()
    .from("bookings")
    .update({ attendance_state: "rejected", status: "no_show_review" })
    .eq("id", input.bookingId)
    .in("status", ["confirmed", "attended", "authorization_failed"]);

  await notify({
    userId: submission.creator_id,
    type: "attendance_rejected",
    title: "Attendance proof was not accepted",
    body: `Reason: ${input.reviewNote}. You can resubmit proof or open a dispute from the booking page.`,
    link: `/creator/bookings/${input.bookingId}`,
  });
  await audit({
    actorId: input.reviewer.id,
    actorRole: input.reviewer.role,
    action: "attendance.reject",
    entityType: "booking",
    entityId: input.bookingId,
    companyId: input.companyId,
    metadata: { reason: input.reviewNote },
  });
  return { ok: true };
}

/**
 * Mark a confirmed booking as a no-show (no check-in happened) and resolve
 * it: capture the hold or excuse the creator (release without charging).
 */
export async function resolveNoShow(input: {
  bookingId: string;
  reviewer: { id: string; role: string };
  companyId: string;
  action: "capture" | "excuse";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = serviceDb();
  const { data: booking } = await db
    .from("bookings")
    .select("id, status, creator_id, company_id")
    .eq("id", input.bookingId)
    .eq("company_id", input.companyId)
    .single();
  if (!booking) return { ok: false, error: "Booking not found" };
  if (!["confirmed", "no_show_review", "authorization_failed"].includes(booking.status)) {
    return { ok: false, error: "Booking is not in a no-show reviewable state" };
  }

  const { data: activeAuth } = await db
    .from("authorization_records")
    .select("id, status")
    .eq("booking_id", booking.id)
    .in("status", ["authorized", "scheduled", "pending", "failed"])
    .maybeSingle();

  if (input.action === "capture") {
    if (!activeAuth || activeAuth.status !== "authorized") {
      return { ok: false, error: "No active hold to capture" };
    }
    const captured = await captureAuthorization(activeAuth.id, input.reviewer);
    if (!captured.ok) return captured;
    await db
      .from("bookings")
      .update({ status: "canceled", canceled_at: new Date().toISOString(), cancel_reason: "no_show" })
      .eq("id", booking.id)
      .in("status", ["confirmed", "no_show_review", "authorization_failed"]);
    await db
      .from("creator_payment_records")
      .update({ status: "canceled", canceled_at: new Date().toISOString() })
      .eq("booking_id", booking.id)
      .in("status", ["pending_fulfillment", "ready", "awaiting_funding", "funded"]);
    await db
      .from("booking_tickets")
      .update({ status: "unused" })
      .eq("booking_id", booking.id)
      .in("status", ["reserved", "issued"]);
  } else {
    if (activeAuth?.status === "authorized") {
      const released = await releaseAuthorization(activeAuth.id, input.reviewer);
      if (!released.ok) return released;
    } else if (activeAuth) {
      await db
        .from("authorization_records")
        .update({ status: "canceled", canceled_at: new Date().toISOString() })
        .eq("id", activeAuth.id)
        .in("status", ["scheduled", "pending", "failed"]);
    }
    await db
      .from("bookings")
      .update({ status: "canceled", canceled_at: new Date().toISOString(), cancel_reason: "no_show_excused" })
      .eq("id", booking.id)
      .in("status", ["confirmed", "no_show_review", "authorization_failed"]);
  }

  await audit({
    actorId: input.reviewer.id,
    actorRole: input.reviewer.role,
    action: `attendance.no_show_${input.action}`,
    entityType: "booking",
    entityId: booking.id,
    companyId: booking.company_id,
  });
  return { ok: true };
}
