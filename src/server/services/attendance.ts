import "server-only";

import { serviceDb } from "@/server/db/service";
import { audit } from "./audit";
import { notify, notifyCompany } from "./notifications";
import { releaseAuthorization, captureAuthorization } from "./payments";
import { uploadFile } from "./uploads";
import { isShowDay } from "@/lib/dates";
import type { Database } from "@/lib/database.types";
import { distanceMeters, formatDistance, locationCheckInVerdict } from "@/lib/geo";
import { geocodeAndStore } from "./venues";

/**
 * Attendance verification. Two evidence sources:
 *   - location: the creator taps "I'm here" on show day; if their phone is at
 *     the venue, attendance is approved automatically (hold released).
 *   - photo: in-app check-in with photo proof, confirmed by the label.
 * Disputes are resolved by admins.
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

export type LocationCheckInResult =
  | { ok: true; distanceM: number }
  | { ok: false; error: string; reason?: "too_far" | "imprecise" | "no_venue_pin" };

/**
 * "I'm here": verify the creator's phone location against the venue's pin and,
 * if they're there, approve attendance on the spot (no label review). Only
 * the server knows the venue's coordinates; the client just sends its fix.
 */
export async function checkInWithLocation(input: {
  creatorId: string;
  bookingId: string;
  lat: number;
  lng: number;
  accuracyM: number;
}): Promise<LocationCheckInResult> {
  const db = serviceDb();
  const { data: booking } = await db
    .from("bookings")
    .select(
      `id, status, attendance_state, company_id, creator_id,
       shows(date, artists(name), venues(id, name, address, city, state, country, latitude, longitude))`,
    )
    .eq("id", input.bookingId)
    .eq("creator_id", input.creatorId)
    .single();
  if (!booking?.shows?.venues) return { ok: false, error: "Booking not found" };
  if (!["confirmed", "authorization_failed", "no_show_review"].includes(booking.status)) {
    return { ok: false, error: "This booking isn't ready for check-in" };
  }
  if (!["not_started", "rejected"].includes(booking.attendance_state)) {
    return { ok: false, error: "You've already checked in" };
  }
  const showDate = booking.shows.date;
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  if (!isShowDay(showDate) || showDate < yesterday) {
    return { ok: false, error: "Location check-in works on the day of the show" };
  }

  // Locate the venue now if the background job hasn't yet.
  const venue = booking.shows.venues;
  let pin = venue.latitude != null && venue.longitude != null ? { lat: venue.latitude, lng: venue.longitude } : null;
  if (!pin) {
    try {
      pin = await geocodeAndStore(venue, db);
    } catch {
      pin = null;
    }
  }
  if (!pin) {
    return {
      ok: false,
      reason: "no_venue_pin",
      error: "We can't place this venue on the map, so check in with a photo below instead.",
    };
  }

  const distanceM = Math.round(distanceMeters({ lat: input.lat, lng: input.lng }, pin));
  const verdict = locationCheckInVerdict(distanceM, input.accuracyM);
  await audit({
    actorId: input.creatorId,
    actorRole: "creator",
    action: verdict === "at_venue" ? "attendance.location_verified" : "attendance.location_rejected",
    entityType: "booking",
    entityId: booking.id,
    companyId: booking.company_id,
    metadata: { distanceM, accuracyM: Math.round(input.accuracyM) },
  });
  if (verdict === "imprecise") {
    return {
      ok: false,
      reason: "imprecise",
      error: "Your phone's location isn't precise enough. Turn on Precise Location for your browser and try again, or check in with a photo.",
    };
  }
  if (verdict === "too_far") {
    return {
      ok: false,
      reason: "too_far",
      error: `You're about ${formatDistance(distanceM)} from ${venue.name}. Check in once you're at the venue.`,
    };
  }

  // Rounded to ~11 m: enough to show where they were, no more.
  const round = (n: number) => Math.round(n * 10_000) / 10_000;
  const { error } = await db.from("attendance_submissions").insert({
    booking_id: booking.id,
    creator_id: input.creatorId,
    company_id: booking.company_id,
    status: "submitted",
    method: "location",
    latitude: round(input.lat),
    longitude: round(input.lng),
    accuracy_m: Math.round(input.accuracyM),
    distance_m: distanceM,
    proof_paths: [],
    note: `Checked in by location, ${formatDistance(distanceM)} from the venue.`,
  });
  if (error) return { ok: false, error: "Couldn't save your check-in. Please try again." };
  await db
    .from("bookings")
    .update({ attendance_state: "submitted" })
    .eq("id", booking.id)
    .in("attendance_state", ["not_started", "rejected"]);

  const approved = await approveAttendance({
    bookingId: booking.id,
    reviewer: { id: null, role: "system" },
    companyId: booking.company_id,
    reviewNote: `Verified automatically by location (${formatDistance(distanceM)} from the venue).`,
  });
  if (!approved.ok) return { ok: false, error: approved.error };

  await notifyCompany(booking.company_id, {
    type: "attendance_approved",
    title: "Creator checked in (verified by location)",
    body: `A creator is at ${venue.name} for ${booking.shows.artists?.name ?? "the show"}. Their hold was released automatically.`,
    link: `/label/bookings/${booking.id}`,
  });
  return { ok: true, distanceM };
}

/** Booking states a label can mark attended (disputes go through admins). */
const MARKABLE_STATUSES: Database["public"]["Enums"]["booking_status"][] = [
  "confirmed",
  "authorization_failed",
  "no_show_review",
];

/**
 * One tap from the artist team: the creator was there. Works with or without
 * a creator check-in (an existing one is simply approved); releases the hold.
 */
export async function markAttended(input: {
  bookingId: string;
  companyId: string;
  reviewer: { id: string; role: string };
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = serviceDb();
  const { data: booking } = await db
    .from("bookings")
    .select("id, status, attendance_state, creator_id, shows(date)")
    .eq("id", input.bookingId)
    .eq("company_id", input.companyId)
    .maybeSingle();
  if (!booking) return { ok: false, error: "Booking not found" };
  if (booking.attendance_state === "approved") return { ok: true };
  if (!MARKABLE_STATUSES.includes(booking.status)) {
    return { ok: false, error: "This booking can't be marked attended" };
  }
  if (!booking.shows || !isShowDay(booking.shows.date)) {
    return { ok: false, error: "You can mark attendance from the day of the show" };
  }

  if (booking.attendance_state !== "submitted") {
    const { error } = await db.from("attendance_submissions").insert({
      booking_id: booking.id,
      creator_id: booking.creator_id,
      company_id: input.companyId,
      status: "submitted",
      method: "label",
      proof_paths: [],
      note: "Marked attended by the artist team.",
    });
    if (error) return { ok: false, error: "Couldn't record attendance. Please try again." };
    await db.from("bookings").update({ attendance_state: "submitted" }).eq("id", booking.id);
  }
  return approveAttendance({
    bookingId: booking.id,
    reviewer: input.reviewer,
    companyId: input.companyId,
    reviewNote: "Marked attended by the artist team.",
  });
}

/** "Mark everyone attended" for one show. */
export async function markAllAttended(input: {
  showId: string;
  companyId: string;
  reviewer: { id: string; role: string };
}): Promise<{ ok: true; marked: number; failed: number }> {
  const { data: bookings } = await serviceDb()
    .from("bookings")
    .select("id")
    .eq("show_id", input.showId)
    .eq("company_id", input.companyId)
    .in("status", MARKABLE_STATUSES)
    .neq("attendance_state", "approved");
  let marked = 0;
  let failed = 0;
  for (const booking of bookings ?? []) {
    const result = await markAttended({ bookingId: booking.id, companyId: input.companyId, reviewer: input.reviewer });
    if (result.ok) marked++;
    else failed++;
  }
  return { ok: true, marked, failed };
}

/** How long a photo check-in can wait for review before it releases itself. */
export const AUTO_RELEASE_HOURS = 48;

/**
 * Scheduled step: a creator checked in but nobody reviewed it within 48 hours
 * → approve it and release the hold, for companies that leave this on
 * (companies.auto_release_attendance, default on). Holds expire at the bank a
 * few days after the show anyway; this releases them deliberately and on time.
 */
export async function autoReleaseUnreviewedCheckIns(): Promise<{ released: number }> {
  const db = serviceDb();
  const cutoff = new Date(Date.now() - AUTO_RELEASE_HOURS * 3_600_000).toISOString();
  const { data: stale } = await db
    .from("attendance_submissions")
    .select("booking_id, company_id, companies!inner(auto_release_attendance), users:users!attendance_submissions_creator_id_fkey(full_name)")
    .eq("status", "submitted")
    .lt("created_at", cutoff)
    .eq("companies.auto_release_attendance", true)
    .limit(50);
  let released = 0;
  for (const row of stale ?? []) {
    const result = await approveAttendance({
      bookingId: row.booking_id,
      reviewer: { id: null, role: "system" },
      companyId: row.company_id,
      reviewNote: `Released automatically: not reviewed within ${AUTO_RELEASE_HOURS} hours.`,
    });
    if (!result.ok) continue;
    released++;
    await notifyCompany(row.company_id, {
      type: "attendance_approved",
      title: "Hold released automatically",
      body: `${row.users?.full_name ?? "A creator"}'s check-in wasn't reviewed within ${AUTO_RELEASE_HOURS} hours, so it was approved and their hold released. You can turn this off in Settings.`,
      link: `/label/bookings/${row.booking_id}`,
    });
  }
  return { released };
}

/**
 * Label (or admin) confirms attendance → hold released, attendance complete,
 * booking moves to attended (or completed when no content is owed).
 */
export async function approveAttendance(input: {
  bookingId: string;
  /** id is null when the system approves (location check-in). */
  reviewer: { id: string | null; role: string };
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
    title: "Attendance verified, hold released",
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
