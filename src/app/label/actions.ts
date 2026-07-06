"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser, requireLabelWithCompany, requireCompanyRole } from "@/server/auth/guards";
import { createCompany, inviteMember, removeMember, changeMemberRole } from "@/server/services/companies";
import { upsertArtist, upsertTour, upsertShow, cancelShow } from "@/server/services/catalog";
import { upsertOpportunity } from "@/server/services/opportunities";
import { approveRequest, rejectRequest, waitlistRequest } from "@/server/services/requests";
import { sendTicketInstructions, cancelBooking } from "@/server/services/bookings";
import { approveAttendance, rejectAttendance, resolveNoShow } from "@/server/services/attendance";
import { reviewContent } from "@/server/services/content";
import { payoutCreatorPayment } from "@/server/services/payments";
import { parseDollarsToCents } from "@/lib/money";
import { RateLimitError } from "@/server/services/rate-limit";
import { AuthError } from "@/server/auth/guards";

export type ActionState = { error: string } | { success: string } | null;

function fail(err: unknown): ActionState {
  if (err instanceof RateLimitError || err instanceof AuthError) return { error: err.message };
  if (err instanceof Error && err.message) return { error: err.message };
  return { error: "Something went wrong. Please try again." };
}

// ── Company onboarding & team ───────────────────────────────────────────

const companySchema = z.object({
  name: z.string().min(2, "Enter your company name").max(120),
  kind: z.enum(["label", "management", "agency"]),
  website: z.string().url("Enter a valid URL").or(z.literal("")),
});

export async function createCompanyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    if (user.role !== "label") return { error: "Label account required" };
    const parsed = companySchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const result = await createCompany({ userId: user.id, ...parsed.data });
    if (!result.ok) return { error: result.error };
  } catch (err) {
    return fail(err);
  }
  redirect("/label?welcome=1");
}

export async function inviteMemberAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await requireLabelWithCompany();
    await requireCompanyRole(context.companyId, "admin");
    const email = z.string().email("Enter a valid email").parse(formData.get("email"));
    const role = z.enum(["admin", "member"]).parse(formData.get("role") ?? "member");
    const result = await inviteMember({
      companyId: context.companyId,
      inviter: { id: context.user.id, role: "label" },
      email,
      role,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath("/label/team");
    return { success: `Invite sent to ${email}` };
  } catch (err) {
    return fail(err);
  }
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const context = await requireLabelWithCompany();
  await requireCompanyRole(context.companyId, "admin");
  const memberUserId = z.string().uuid().parse(formData.get("memberUserId"));
  await removeMember({
    companyId: context.companyId,
    actor: { id: context.user.id, role: "label" },
    memberUserId,
  });
  revalidatePath("/label/team");
}

export async function changeMemberRoleAction(formData: FormData): Promise<void> {
  const context = await requireLabelWithCompany();
  await requireCompanyRole(context.companyId, "admin");
  const memberUserId = z.string().uuid().parse(formData.get("memberUserId"));
  const newRole = z.enum(["admin", "member"]).parse(formData.get("newRole"));
  await changeMemberRole({
    companyId: context.companyId,
    actor: { id: context.user.id, role: "label" },
    memberUserId,
    newRole,
  });
  revalidatePath("/label/team");
}

// ── Artists & tours ─────────────────────────────────────────────────────

const artistSchema = z.object({
  artistId: z.string().uuid().optional().or(z.literal("")),
  name: z.string().min(1, "Artist name is required").max(120),
  genre: z.string().max(60),
  bio: z.string().max(1000),
  instagramHandle: z.string().max(60),
  spotifyUrl: z.string().url().or(z.literal("")),
});

export async function saveArtistAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await requireLabelWithCompany();
    const parsed = artistSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const imageFile = formData.get("image");
    const result = await upsertArtist({
      companyId: context.companyId,
      actor: { id: context.user.id, role: "label" },
      artistId: parsed.data.artistId || undefined,
      name: parsed.data.name,
      genre: parsed.data.genre,
      bio: parsed.data.bio,
      instagramHandle: parsed.data.instagramHandle.replace(/^@/, ""),
      spotifyUrl: parsed.data.spotifyUrl,
      imageFile: imageFile instanceof File ? imageFile : null,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath("/label/tours");
    return { success: "Artist saved" };
  } catch (err) {
    return fail(err);
  }
}

const tourSchema = z.object({
  tourId: z.string().uuid().optional().or(z.literal("")),
  // Either an existing artist id, or new-artist fields (created inline).
  artistId: z.string().uuid().optional().or(z.literal("")),
  newArtistName: z.string().max(120).optional().or(z.literal("")),
  newArtistGenre: z.string().max(60).optional().or(z.literal("")),
  newArtistInstagram: z.string().max(60).optional().or(z.literal("")),
  name: z.string().min(1, "Tour name is required").max(160),
  description: z.string().max(1000),
  startsOn: z.string().optional().or(z.literal("")),
  endsOn: z.string().optional().or(z.literal("")),
});

export async function saveTourAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await requireLabelWithCompany();
    const parsed = tourSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const actor = { id: context.user.id, role: "label" as const };

    // Resolve the artist: use the selected one, or create a new one inline.
    let artistId = parsed.data.artistId || "";
    if (!artistId) {
      const name = parsed.data.newArtistName?.trim();
      if (!name) return { error: "Pick an existing artist or add a new one" };
      const image = formData.get("image");
      const created = await upsertArtist({
        companyId: context.companyId,
        actor,
        name,
        genre: parsed.data.newArtistGenre ?? "",
        bio: "",
        instagramHandle: (parsed.data.newArtistInstagram ?? "").replace(/^@/, ""),
        spotifyUrl: "",
        imageFile: image instanceof File ? image : null,
      });
      if (!created.ok) return { error: created.error };
      artistId = created.artistId;
    }

    const result = await upsertTour({
      companyId: context.companyId,
      actor,
      tourId: parsed.data.tourId || undefined,
      artistId,
      name: parsed.data.name,
      description: parsed.data.description,
      startsOn: parsed.data.startsOn,
      endsOn: parsed.data.endsOn,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath("/label/tours");
    return { success: "Tour saved" };
  } catch (err) {
    return fail(err);
  }
}

// ── Shows & opportunities ───────────────────────────────────────────────

const showSchema = z.object({
  showId: z.string().uuid().optional().or(z.literal("")),
  artistId: z.string().uuid("Pick an artist"),
  tourId: z.string().uuid().optional().or(z.literal("")),
  venueName: z.string().min(1, "Venue name is required").max(160),
  venueCity: z.string().min(1, "City is required").max(80),
  venueState: z.string().max(40),
  venueAddress: z.string().max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  doorsTime: z.string().optional().or(z.literal("")),
  startTime: z.string().optional().or(z.literal("")),
  ticketDeliveryMethod: z.enum(["will_call", "digital_transfer", "guest_list", "box_office"]),
  // opportunity fields
  statedTicketValue: z.string().min(1, "Enter the stated ticket value"),
  depositPercentage: z.coerce.number().int(),
  creatorPayment: z.string(),
  plusOneAllowed: z.string().optional(),
  ticketsTotal: z.coerce.number().int().min(1, "Offer at least 1 ticket").max(500),
  applicationDeadline: z.string().min(1, "Set an application deadline"),
  contentDeadlineDays: z.coerce.number().int().min(0).max(90),
  notes: z.string().max(1000),
  deliverables: z.string(), // JSON
  publish: z.string().optional(),
});

const deliverablesSchema = z.array(
  z.object({
    platform: z.enum([
      "instagram_story", "instagram_reel", "instagram_post", "tiktok_video",
      "youtube_short", "youtube_video", "twitter_post", "other",
    ]),
    quantity: z.number().int().min(1).max(20),
    description: z.string().max(300),
  }),
).max(8);

export async function saveShowAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let showId = "";
  try {
    const context = await requireLabelWithCompany();
    const parsed = showSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const data = parsed.data;

    let deliverables: z.infer<typeof deliverablesSchema> = [];
    try {
      deliverables = deliverablesSchema.parse(JSON.parse(data.deliverables || "[]"));
    } catch {
      return { error: "Check the deliverables list" };
    }

    let statedTicketValueCents: number;
    let creatorPaymentCents: number;
    try {
      statedTicketValueCents = parseDollarsToCents(data.statedTicketValue);
      creatorPaymentCents = data.creatorPayment ? parseDollarsToCents(data.creatorPayment) : 0;
    } catch {
      return { error: "Enter dollar amounts like 120 or 120.50" };
    }

    const imageFile = formData.get("image");
    const showResult = await upsertShow({
      companyId: context.companyId,
      actor: { id: context.user.id, role: "label" },
      showId: data.showId || undefined,
      artistId: data.artistId,
      tourId: data.tourId || undefined,
      venue: {
        name: data.venueName,
        city: data.venueCity,
        state: data.venueState || undefined,
        address: data.venueAddress || undefined,
      },
      date: data.date,
      doorsTime: data.doorsTime || undefined,
      startTime: data.startTime || undefined,
      ticketDeliveryMethod: data.ticketDeliveryMethod,
      imageFile: imageFile instanceof File ? imageFile : null,
    });
    if (!showResult.ok) return { error: showResult.error };
    showId = showResult.showId;

    const oppResult = await upsertOpportunity({
      companyId: context.companyId,
      actor: { id: context.user.id, role: "label" },
      showId,
      statedTicketValueCents,
      depositPercentage: data.depositPercentage,
      creatorPaymentCents,
      plusOneAllowed: data.plusOneAllowed === "on",
      ticketsTotal: data.ticketsTotal,
      applicationDeadline: new Date(data.applicationDeadline).toISOString(),
      contentDeadlineDays: data.contentDeadlineDays,
      notes: data.notes,
      deliverables,
      publish: data.publish === "true",
    });
    if (!oppResult.ok) return { error: oppResult.error };
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/label/shows");
  redirect(`/label/shows/${showId}?saved=1`);
}

export async function cancelShowAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await requireLabelWithCompany();
    await requireCompanyRole(context.companyId, "admin");
    const showId = z.string().uuid().parse(formData.get("showId"));
    const reason = z.string().min(3, "Give a short reason").max(300).parse(formData.get("reason"));
    const result = await cancelShow({
      showId,
      actor: { id: context.user.id, role: "label" },
      companyId: context.companyId,
      reason,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath("/label/shows");
    return { success: `Show canceled — ${result.canceledBookings} booking(s) released` };
  } catch (err) {
    return fail(err);
  }
}

// ── Request review ──────────────────────────────────────────────────────

export async function approveRequestAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await requireLabelWithCompany();
    const requestId = z.string().uuid().parse(formData.get("requestId"));
    const confirmedTickets = formData.get("confirmedTicketCount");
    const result = await approveRequest({
      requestId,
      reviewer: { id: context.user.id, role: "label" },
      companyId: context.companyId,
      confirmedTicketCount: confirmedTickets
        ? (z.coerce.number().pipe(z.union([z.literal(1), z.literal(2)])).parse(confirmedTickets) as 1 | 2)
        : undefined,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath("/label/requests");
    return { success: "Approved — the creator has 24 hours to accept" };
  } catch (err) {
    return fail(err);
  }
}

export async function rejectRequestAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await requireLabelWithCompany();
    const requestId = z.string().uuid().parse(formData.get("requestId"));
    const result = await rejectRequest({
      requestId,
      reviewer: { id: context.user.id, role: "label" },
      companyId: context.companyId,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath("/label/requests");
    return { success: "Request declined" };
  } catch (err) {
    return fail(err);
  }
}

export async function waitlistRequestAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await requireLabelWithCompany();
    const requestId = z.string().uuid().parse(formData.get("requestId"));
    const result = await waitlistRequest({
      requestId,
      reviewer: { id: context.user.id, role: "label" },
      companyId: context.companyId,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath("/label/requests");
    return { success: "Moved to waitlist" };
  } catch (err) {
    return fail(err);
  }
}

// ── Booking management ──────────────────────────────────────────────────

export async function sendInstructionsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await requireLabelWithCompany();
    const bookingId = z.string().uuid().parse(formData.get("bookingId"));
    const instructions = z
      .string()
      .min(5, "Write the pickup / delivery instructions")
      .max(2000)
      .parse(formData.get("instructions"));
    const result = await sendTicketInstructions({
      bookingId,
      companyId: context.companyId,
      sender: { id: context.user.id, role: "label" },
      instructions,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath(`/label/bookings/${bookingId}`);
    return { success: "Instructions sent to the creator" };
  } catch (err) {
    return fail(err);
  }
}

export async function cancelBookingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await requireLabelWithCompany();
    await requireCompanyRole(context.companyId, "admin");
    const bookingId = z.string().uuid().parse(formData.get("bookingId"));
    const reason = z.string().min(3).max(300).parse(formData.get("reason"));
    // Scope check: booking must belong to this company.
    const { serviceDb } = await import("@/server/db/service");
    const { data: booking } = await serviceDb()
      .from("bookings")
      .select("company_id")
      .eq("id", bookingId)
      .single();
    if (booking?.company_id !== context.companyId) return { error: "Booking not found" };
    const result = await cancelBooking({
      bookingId,
      actor: { id: context.user.id, role: "label" },
      reason,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath(`/label/bookings/${bookingId}`);
    return { success: "Booking canceled and hold released" };
  } catch (err) {
    return fail(err);
  }
}

export async function approveAttendanceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await requireLabelWithCompany();
    const bookingId = z.string().uuid().parse(formData.get("bookingId"));
    const result = await approveAttendance({
      bookingId,
      reviewer: { id: context.user.id, role: "label" },
      companyId: context.companyId,
      reviewNote: z.string().max(500).parse(formData.get("reviewNote") ?? "") || undefined,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath(`/label/bookings/${bookingId}`);
    revalidatePath("/label/attendance");
    return { success: "Attendance approved — the creator's hold was released" };
  } catch (err) {
    return fail(err);
  }
}

export async function rejectAttendanceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await requireLabelWithCompany();
    const bookingId = z.string().uuid().parse(formData.get("bookingId"));
    const reviewNote = z
      .string()
      .min(5, "Tell the creator why the proof was rejected")
      .max(500)
      .parse(formData.get("reviewNote"));
    const result = await rejectAttendance({
      bookingId,
      reviewer: { id: context.user.id, role: "label" },
      companyId: context.companyId,
      reviewNote,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath(`/label/bookings/${bookingId}`);
    revalidatePath("/label/attendance");
    return { success: "Attendance rejected — booking moved to no-show review" };
  } catch (err) {
    return fail(err);
  }
}

export async function resolveNoShowAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await requireLabelWithCompany();
    await requireCompanyRole(context.companyId, "admin");
    const bookingId = z.string().uuid().parse(formData.get("bookingId"));
    const action = z.enum(["capture", "excuse"]).parse(formData.get("noShowAction"));
    const result = await resolveNoShow({
      bookingId,
      reviewer: { id: context.user.id, role: "label" },
      companyId: context.companyId,
      action,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath(`/label/bookings/${bookingId}`);
    return {
      success:
        action === "capture"
          ? "Hold captured for the no-show"
          : "Creator excused — hold released without charge",
    };
  } catch (err) {
    return fail(err);
  }
}

export async function reviewContentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await requireLabelWithCompany();
    const bookingId = z.string().uuid().parse(formData.get("bookingId"));
    const submissionId = z.string().uuid().parse(formData.get("submissionId"));
    const decision = z
      .enum(["approved", "revision_requested", "rejected"])
      .parse(formData.get("decision"));
    const reviewNote = z.string().max(500).parse(formData.get("reviewNote") ?? "");
    if (decision !== "approved" && reviewNote.length < 5) {
      return { error: "Add a note for the creator explaining the decision" };
    }
    const result = await reviewContent({
      bookingId,
      submissionId,
      reviewer: { id: context.user.id, role: "label" },
      companyId: context.companyId,
      decision,
      reviewNote: reviewNote || undefined,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath(`/label/bookings/${bookingId}`);
    revalidatePath("/label/content");
    return {
      success:
        decision === "approved"
          ? result.paid
            ? "Content approved — creator payment released"
            : "Content approved"
          : decision === "revision_requested"
            ? "Revision requested"
            : "Content rejected",
    };
  } catch (err) {
    return fail(err);
  }
}

export async function retryPayoutAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await requireLabelWithCompany();
    await requireCompanyRole(context.companyId, "admin");
    const bookingId = z.string().uuid().parse(formData.get("bookingId"));
    const { serviceDb } = await import("@/server/db/service");
    const { data: booking } = await serviceDb()
      .from("bookings")
      .select("company_id")
      .eq("id", bookingId)
      .single();
    if (booking?.company_id !== context.companyId) return { error: "Booking not found" };
    const result = await payoutCreatorPayment(bookingId, { id: context.user.id, role: "label" });
    if (!result.ok) return { error: result.error };
    revalidatePath(`/label/bookings/${bookingId}`);
    return { success: "Creator payment released" };
  } catch (err) {
    return fail(err);
  }
}
