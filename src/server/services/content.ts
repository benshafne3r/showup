import "server-only";

import { serviceDb } from "@/server/db/service";
import { audit } from "./audit";
import { notify, notifyCompany } from "./notifications";
import { payoutCreatorPayment } from "./payments";
import { uploadFile } from "./uploads";

/**
 * Content deliverables track: submit → review (approve / revision / reject).
 * Approval marks the payment ready and pays it out. Independent from
 * attendance — attending without posting releases the hold but pays nothing.
 */

export async function submitContent(input: {
  creatorId: string;
  bookingId: string;
  postUrl: string;
  captionNote: string;
  deliverableId?: string;
  proofFiles: File[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = serviceDb();
  const { data: booking } = await db
    .from("bookings")
    .select("id, status, content_required, content_state, company_id, creator_id, shows(artists(name))")
    .eq("id", input.bookingId)
    .eq("creator_id", input.creatorId)
    .single();
  if (!booking) return { ok: false, error: "Booking not found" };
  if (!booking.content_required) return { ok: false, error: "This booking has no content requirements" };
  if (!["confirmed", "attended", "completed"].includes(booking.status)) {
    return { ok: false, error: "This booking isn't accepting content submissions" };
  }
  if (!["pending", "revision_requested", "rejected"].includes(booking.content_state)) {
    return { ok: false, error: "Content was already submitted and is under review" };
  }

  const proofPaths: string[] = [];
  for (const file of input.proofFiles.slice(0, 3)) {
    proofPaths.push(await uploadFile("proofs", input.creatorId, file));
  }

  const { error } = await db.from("content_submissions").insert({
    booking_id: booking.id,
    creator_id: input.creatorId,
    company_id: booking.company_id,
    deliverable_id: input.deliverableId ?? null,
    status: "submitted",
    post_url: input.postUrl,
    proof_paths: proofPaths,
    caption_note: input.captionNote,
  });
  if (error) return { ok: false, error: error.message };

  await db
    .from("bookings")
    .update({ content_state: "submitted" })
    .eq("id", booking.id)
    .in("content_state", ["pending", "revision_requested", "rejected"]);

  await notifyCompany(booking.company_id, {
    type: "content_submitted",
    title: "Content submitted for review",
    body: `A creator submitted deliverables for ${booking.shows?.artists?.name ?? "a show"}.`,
    link: `/label/bookings/${booking.id}`,
  });
  await audit({
    actorId: input.creatorId,
    actorRole: "creator",
    action: "content.submit",
    entityType: "booking",
    entityId: booking.id,
    companyId: booking.company_id,
    metadata: { postUrl: input.postUrl },
  });
  return { ok: true };
}

export async function reviewContent(input: {
  bookingId: string;
  submissionId: string;
  reviewer: { id: string; role: string };
  companyId: string;
  decision: "approved" | "revision_requested" | "rejected";
  reviewNote?: string;
}): Promise<{ ok: true; paid?: boolean } | { ok: false; error: string }> {
  const db = serviceDb();
  const { data: submission } = await db
    .from("content_submissions")
    .update({
      status: input.decision,
      reviewed_by: input.reviewer.id,
      reviewed_at: new Date().toISOString(),
      review_note: input.reviewNote ?? null,
    })
    .eq("id", input.submissionId)
    .eq("booking_id", input.bookingId)
    .eq("company_id", input.companyId)
    .in("status", ["submitted", "disputed"])
    .select("id, creator_id")
    .maybeSingle();
  if (!submission) return { ok: false, error: "No reviewable content submission found" };

  const { data: booking } = await db
    .from("bookings")
    .select("id, status, attendance_state, creator_payment_cents, creator_id, company_id")
    .eq("id", input.bookingId)
    .single();
  if (!booking) return { ok: false, error: "Booking not found" };

  await db.from("bookings").update({ content_state: input.decision }).eq("id", booking.id);

  if (input.decision === "revision_requested") {
    await notify({
      userId: booking.creator_id,
      type: "content_revision_requested",
      title: "Revision requested on your content",
      body: input.reviewNote ?? "The team asked for changes to your submission.",
      link: `/creator/bookings/${booking.id}`,
    });
  } else if (input.decision === "rejected") {
    await notify({
      userId: booking.creator_id,
      type: "content_submitted",
      title: "Content was not approved",
      body: input.reviewNote ?? "Your submission was not approved. You can open a dispute from the booking page.",
      link: `/creator/bookings/${booking.id}`,
    });
  }

  let paid = false;
  if (input.decision === "approved") {
    // Content approved → payment becomes ready → pay it out.
    await db
      .from("creator_payment_records")
      .update({ status: "ready" })
      .eq("booking_id", booking.id)
      .in("status", ["pending_fulfillment", "awaiting_funding", "funded"]);

    if (booking.creator_payment_cents > 0) {
      const payout = await payoutCreatorPayment(booking.id, input.reviewer);
      paid = payout.ok;
      if (!payout.ok) {
        // Payment stays `failed` with reason; label/admin can retry from the UI.
        console.error("payout failed after content approval:", payout.error);
      }
    }

    if (booking.attendance_state === "approved") {
      await db
        .from("bookings")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", booking.id)
        .in("status", ["attended", "confirmed", "disputed"]);
    }

    await notify({
      userId: booking.creator_id,
      type: "content_approved",
      title: "Your content was approved",
      body: paid
        ? "The team approved your deliverables and your creator payment has been released."
        : "The team approved your deliverables. Your payment is being processed.",
      link: `/creator/bookings/${booking.id}`,
    });
  }

  await audit({
    actorId: input.reviewer.id,
    actorRole: input.reviewer.role,
    action: `content.${input.decision}`,
    entityType: "content_submission",
    entityId: submission.id,
    companyId: booking.company_id,
    metadata: { bookingId: booking.id, reviewNote: input.reviewNote },
  });
  return { ok: true, paid };
}
