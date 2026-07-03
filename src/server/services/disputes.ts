import "server-only";

import { serviceDb } from "@/server/db/service";
import { audit } from "./audit";
import { notify, notifyCompany } from "./notifications";
import { releaseAuthorization, captureAuthorization, payoutCreatorPayment } from "./payments";
import { uploadFile } from "./uploads";
import type { Database } from "@/lib/database.types";

type DisputeKind = Database["public"]["Enums"]["dispute_kind"];

/**
 * Disputes freeze automated money movement on a booking until an admin
 * resolves them with explicit actions.
 */

export async function openDispute(input: {
  openedBy: { id: string; role: string };
  bookingId: string;
  kind: DisputeKind;
  reason: string;
  evidenceFiles?: File[];
}): Promise<{ ok: true; disputeId: string } | { ok: false; error: string }> {
  const db = serviceDb();
  const { data: booking } = await db
    .from("bookings")
    .select("id, creator_id, company_id, status")
    .eq("id", input.bookingId)
    .single();
  if (!booking) return { ok: false, error: "Booking not found" };

  const isCreator = booking.creator_id === input.openedBy.id;
  if (!isCreator && input.openedBy.role === "creator") {
    return { ok: false, error: "You can only dispute your own bookings" };
  }

  const evidencePaths: string[] = [];
  for (const file of (input.evidenceFiles ?? []).slice(0, 5)) {
    evidencePaths.push(await uploadFile("proofs", input.openedBy.id, file));
  }

  const { data: dispute, error } = await db
    .from("disputes")
    .insert({
      booking_id: booking.id,
      company_id: booking.company_id,
      creator_id: booking.creator_id,
      kind: input.kind,
      opened_by: input.openedBy.id,
      reason: input.reason,
      evidence_paths: evidencePaths,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  // Freeze the booking + payment automation.
  await db
    .from("bookings")
    .update({ status: "disputed" })
    .eq("id", booking.id)
    .in("status", ["confirmed", "attended", "no_show_review", "authorization_failed"]);
  await db
    .from("creator_payment_records")
    .update({ status: "disputed" })
    .eq("booking_id", booking.id)
    .in("status", ["pending_fulfillment", "ready", "failed"]);

  await notify({
    userId: booking.creator_id,
    type: "dispute_opened",
    title: "A dispute was opened",
    body: "Money movement on this booking is paused until an administrator resolves the dispute.",
    link: `/creator/bookings/${booking.id}`,
  });
  await notifyCompany(booking.company_id, {
    type: "dispute_opened",
    title: "A dispute was opened",
    body: `Dispute kind: ${input.kind}. An administrator will review it.`,
    link: `/label/bookings/${booking.id}`,
  });
  await audit({
    actorId: input.openedBy.id,
    actorRole: input.openedBy.role,
    action: "dispute.open",
    entityType: "dispute",
    entityId: dispute.id,
    companyId: booking.company_id,
    metadata: { kind: input.kind, bookingId: booking.id },
  });
  return { ok: true, disputeId: dispute.id };
}

export type DisputeResolution =
  | "release_hold" // creator wins an attendance/charge dispute
  | "capture_hold" // label wins a no-show dispute
  | "pay_creator" // creator wins a content dispute
  | "deny_payment" // label wins a content dispute
  | "no_action"; // resolved by notes only

export async function resolveDispute(input: {
  admin: { id: string; role: string };
  disputeId: string;
  resolution: DisputeResolution;
  notes: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = serviceDb();
  const { data: dispute } = await db
    .from("disputes")
    .update({
      status: "resolved",
      resolution: `${input.resolution}: ${input.notes}`,
      resolved_by: input.admin.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", input.disputeId)
    .in("status", ["open", "under_review"])
    .select("id, booking_id, company_id, creator_id, kind")
    .maybeSingle();
  if (!dispute) return { ok: false, error: "Dispute is not open" };

  const { data: booking } = await db
    .from("bookings")
    .select("id, content_required, content_state, attendance_state, creator_payment_cents")
    .eq("id", dispute.booking_id)
    .single();

  if (input.resolution === "release_hold" && booking) {
    const { data: auth } = await db
      .from("authorization_records")
      .select("id, status")
      .eq("booking_id", booking.id)
      .in("status", ["authorized", "scheduled", "pending", "failed"])
      .maybeSingle();
    if (auth?.status === "authorized") {
      const released = await releaseAuthorization(auth.id, input.admin);
      if (!released.ok) return released;
    } else if (auth) {
      await db
        .from("authorization_records")
        .update({ status: "canceled", canceled_at: new Date().toISOString() })
        .eq("id", auth.id);
    }
    await db
      .from("bookings")
      .update({ attendance_state: "approved", status: "attended" })
      .eq("id", booking.id)
      .eq("status", "disputed");
    await db
      .from("attendance_submissions")
      .update({ status: "approved", reviewed_by: input.admin.id, reviewed_at: new Date().toISOString() })
      .eq("booking_id", booking.id)
      .in("status", ["submitted", "rejected", "disputed"]);
  } else if (input.resolution === "capture_hold" && booking) {
    const { data: auth } = await db
      .from("authorization_records")
      .select("id, status")
      .eq("booking_id", booking.id)
      .eq("status", "authorized")
      .maybeSingle();
    if (!auth) return { ok: false, error: "No active hold to capture" };
    const captured = await captureAuthorization(auth.id, input.admin);
    if (!captured.ok) return captured;
    await db
      .from("bookings")
      .update({ status: "canceled", canceled_at: new Date().toISOString(), cancel_reason: "no_show_dispute" })
      .eq("id", booking.id)
      .eq("status", "disputed");
    await db
      .from("creator_payment_records")
      .update({ status: "canceled", canceled_at: new Date().toISOString() })
      .eq("booking_id", booking.id)
      .eq("status", "disputed");
  } else if (input.resolution === "pay_creator" && booking) {
    await db
      .from("content_submissions")
      .update({ status: "approved", reviewed_by: input.admin.id, reviewed_at: new Date().toISOString() })
      .eq("booking_id", booking.id)
      .in("status", ["submitted", "rejected", "disputed"]);
    await db
      .from("bookings")
      .update({ content_state: "approved" })
      .eq("id", booking.id);
    await db
      .from("creator_payment_records")
      .update({ status: "ready" })
      .eq("booking_id", booking.id)
      .in("status", ["disputed", "pending_fulfillment", "failed"]);
    if (booking.creator_payment_cents > 0) {
      const paid = await payoutCreatorPayment(booking.id, input.admin);
      if (!paid.ok) return paid;
    }
    await db
      .from("bookings")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", booking.id)
      .eq("status", "disputed");
  } else if (input.resolution === "deny_payment" && booking) {
    await db
      .from("creator_payment_records")
      .update({ status: "canceled", canceled_at: new Date().toISOString() })
      .eq("booking_id", booking.id)
      .in("status", ["disputed", "ready", "pending_fulfillment", "failed"]);
    await db
      .from("bookings")
      .update({
        content_state: "rejected",
        status: booking.attendance_state === "approved" ? "attended" : "confirmed",
      })
      .eq("id", booking.id)
      .eq("status", "disputed");
  } else {
    // no_action: unfreeze to a sensible state.
    await db
      .from("bookings")
      .update({ status: booking?.attendance_state === "approved" ? "attended" : "confirmed" })
      .eq("id", dispute.booking_id)
      .eq("status", "disputed");
    await db
      .from("creator_payment_records")
      .update({ status: "pending_fulfillment" })
      .eq("booking_id", dispute.booking_id)
      .eq("status", "disputed");
  }

  await notify({
    userId: dispute.creator_id,
    type: "dispute_resolved",
    title: "Your dispute was resolved",
    body: input.notes,
    link: `/creator/bookings/${dispute.booking_id}`,
  });
  await notifyCompany(dispute.company_id, {
    type: "dispute_resolved",
    title: "Dispute resolved",
    body: input.notes,
    link: `/label/bookings/${dispute.booking_id}`,
  });
  await audit({
    actorId: input.admin.id,
    actorRole: "admin",
    action: "dispute.resolve",
    entityType: "dispute",
    entityId: dispute.id,
    companyId: dispute.company_id,
    metadata: { resolution: input.resolution, notes: input.notes },
  });
  return { ok: true };
}
