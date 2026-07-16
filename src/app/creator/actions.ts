"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCreator, requireUser } from "@/server/auth/guards";
import { upsertCreatorProfile } from "@/server/services/profiles";
import { createRequest, withdrawRequest } from "@/server/services/requests";
import { acceptBooking } from "@/server/services/bookings";
import {
  attachPaymentMethod,
  attachPaymentMethodByToken,
  retryAuthorizationForBooking,
} from "@/server/services/payments";
import { createOnboardingLink } from "@/server/services/connect";
import { log, errorFields } from "@/server/log";
import { submitAttendance } from "@/server/services/attendance";
import { submitContent } from "@/server/services/content";
import { sendMessage, markThreadRead } from "@/server/services/messaging";
import { openDispute } from "@/server/services/disputes";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/server/services/notifications";
import { toActionError } from "@/server/action-error";

// "use server" files may only export async functions; declare the type inline
// (erased at compile time) rather than re-exporting it.
export type ActionState = { error: string } | { success: string } | null;

const fail = (err: unknown): ActionState => toActionError(err, "creator.action");

// ── Onboarding / profile ────────────────────────────────────────────────

const profileSchema = z.object({
  city: z.string().min(2, "Enter your city").max(80),
  bio: z.string().max(600),
  categories: z.string().max(200),
  audienceSize: z.coerce.number().int().min(0).max(1_000_000_000),
  avgViews: z.coerce.number().int().min(0).max(1_000_000_000),
  exampleWork: z.string().max(2000),
  socials: z.string(), // JSON payload from the client form
});

const socialsSchema = z.array(
  z.object({
    platform: z.enum(["instagram", "tiktok", "youtube", "twitter", "twitch", "other"]),
    handle: z.string().min(1).max(80),
    followers: z.number().int().min(0),
    avgViews: z.number().int().min(0),
  }),
).max(6);

export async function saveCreatorProfile(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireCreator();
    const parsed = profileSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: parsed.error.issues[0].message };

    let socials: z.infer<typeof socialsSchema> = [];
    try {
      socials = socialsSchema.parse(JSON.parse(parsed.data.socials || "[]"));
    } catch {
      return { error: "Check your social accounts — handles are required" };
    }

    const result = await upsertCreatorProfile({
      userId: user.id,
      city: parsed.data.city,
      bio: parsed.data.bio,
      categories: parsed.data.categories
        .split(",")
        .map((c) => c.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 8),
      audienceSize: parsed.data.audienceSize,
      avgViews: parsed.data.avgViews,
      exampleWork: parsed.data.exampleWork
        .split("\n")
        .map((u) => u.trim())
        .filter((u) => /^https?:\/\//.test(u))
        .slice(0, 6),
      socialAccounts: socials,
      markOnboarded: true,
    });
    if (!result.ok) return { error: result.error };
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/creator", "layout");
  redirect("/creator?welcome=1");
}

export async function updateCreatorProfile(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireCreator();
    const parsed = profileSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    let socials: z.infer<typeof socialsSchema> = [];
    try {
      socials = socialsSchema.parse(JSON.parse(parsed.data.socials || "[]"));
    } catch {
      return { error: "Check your social accounts — handles are required" };
    }
    const result = await upsertCreatorProfile({
      userId: user.id,
      city: parsed.data.city,
      bio: parsed.data.bio,
      categories: parsed.data.categories
        .split(",")
        .map((c) => c.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 8),
      audienceSize: parsed.data.audienceSize,
      avgViews: parsed.data.avgViews,
      exampleWork: parsed.data.exampleWork
        .split("\n")
        .map((u) => u.trim())
        .filter((u) => /^https?:\/\//.test(u))
        .slice(0, 6),
      socialAccounts: socials,
      markOnboarded: true,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath("/creator/settings");
    return { success: "Profile saved" };
  } catch (err) {
    return fail(err);
  }
}

// ── Requests ────────────────────────────────────────────────────────────

const requestSchema = z.object({
  opportunityId: z.string().uuid(),
  ticketCount: z.coerce.number().pipe(z.union([z.literal(1), z.literal(2)])),
  message: z.string().max(1000),
});

export async function requestAccess(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let requestOk = false;
  try {
    const user = await requireCreator();
    const parsed = requestSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const result = await createRequest({
      creatorId: user.id,
      opportunityId: parsed.data.opportunityId,
      ticketCount: parsed.data.ticketCount as 1 | 2,
      message: parsed.data.message,
    });
    if (!result.ok) return { error: result.error };
    requestOk = true;
  } catch (err) {
    return fail(err);
  }
  if (requestOk) {
    revalidatePath("/creator/messages");
    redirect("/creator/messages?tab=requests&submitted=1");
  }
  return null;
}

export async function withdrawRequestAction(formData: FormData): Promise<void> {
  const user = await requireCreator();
  const requestId = z.string().uuid().parse(formData.get("requestId"));
  await withdrawRequest(user.id, requestId);
  revalidatePath("/creator/messages");
}

// ── Payment method + booking acceptance ─────────────────────────────────

const cardSchema = z.object({
  cardNumber: z.string().regex(/^[\d\s]{13,23}$/, "Enter a valid card number"),
  expMonth: z.coerce.number().int().min(1, "Month").max(12, "Month"),
  expYear: z.coerce.number().int().min(2024).max(2050),
  cvc: z.string().regex(/^\d{3,4}$/, "Enter the 3–4 digit CVC"),
});

export async function addPaymentMethod(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireCreator();
    const parsed = cardSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const result = await attachPaymentMethod(user.id, { ...parsed.data, cvc: parsed.data.cvc });
    if (!result.ok) return { error: result.error };
    revalidatePath("/creator", "layout");
    return { success: "Card verified and saved" };
  } catch (err) {
    return fail(err);
  }
}

export async function addPaymentMethodToken(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireCreator();
    // Stripe Elements tokenized the card in the browser; we only get a pm_ id.
    const paymentMethodId = z.string().startsWith("pm_").max(255).parse(formData.get("paymentMethodId"));
    const result = await attachPaymentMethodByToken(user.id, paymentMethodId);
    if (!result.ok) return { error: result.error };
    revalidatePath("/creator", "layout");
    return { success: "Card verified and saved" };
  } catch (err) {
    return fail(err);
  }
}

export async function acceptBookingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let bookingId = "";
  try {
    const user = await requireCreator();
    bookingId = z.string().uuid().parse(formData.get("bookingId"));
    const agreed = formData.get("agreeTerms") === "on";
    const result = await acceptBooking({
      creatorId: user.id,
      bookingId,
      agreedToTerms: agreed,
    });
    if (!result.ok) return { error: result.error };
  } catch (err) {
    return fail(err);
  }
  revalidatePath(`/creator/bookings/${bookingId}`);
  redirect(`/creator/bookings/${bookingId}?confirmed=1`);
}

export async function retryAuthorizationAction(formData: FormData): Promise<void> {
  const user = await requireCreator();
  const bookingId = z.string().uuid().parse(formData.get("bookingId"));
  // Ownership is enforced inside the service via the booking's creator link;
  // double-check here for defense in depth.
  const { serviceDb } = await import("@/server/db/service");
  const { data: booking } = await serviceDb()
    .from("bookings")
    .select("creator_id")
    .eq("id", bookingId)
    .single();
  if (booking?.creator_id !== user.id) return;
  await retryAuthorizationForBooking(bookingId);
  revalidatePath(`/creator/bookings/${bookingId}`);
}

// ── Attendance & content ────────────────────────────────────────────────

export async function submitAttendanceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireCreator();
    const bookingId = z.string().uuid().parse(formData.get("bookingId"));
    const note = z.string().max(500).parse(formData.get("note") ?? "");
    const files = formData
      .getAll("proof")
      .filter((f): f is File => f instanceof File && f.size > 0);
    const result = await submitAttendance({
      creatorId: user.id,
      bookingId,
      note,
      proofFiles: files,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath(`/creator/bookings/${bookingId}`);
    return { success: "Checked in! The team will verify your attendance." };
  } catch (err) {
    return fail(err);
  }
}

export async function submitContentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireCreator();
    const bookingId = z.string().uuid().parse(formData.get("bookingId"));
    const postUrl = z.string().url("Enter the full post URL").parse(formData.get("postUrl"));
    const captionNote = z.string().max(500).parse(formData.get("captionNote") ?? "");
    const deliverableId = formData.get("deliverableId");
    const files = formData
      .getAll("proof")
      .filter((f): f is File => f instanceof File && f.size > 0);
    const result = await submitContent({
      creatorId: user.id,
      bookingId,
      postUrl,
      captionNote,
      deliverableId: deliverableId ? z.string().uuid().parse(deliverableId) : undefined,
      proofFiles: files,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath(`/creator/bookings/${bookingId}`);
    return { success: "Content submitted for review." };
  } catch (err) {
    return fail(err);
  }
}

export async function openDisputeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireCreator();
    const bookingId = z.string().uuid().parse(formData.get("bookingId"));
    const kind = z.enum(["attendance", "content", "charge", "other"]).parse(formData.get("kind"));
    const reason = z.string().min(20, "Explain what happened (at least 20 characters)").max(2000).parse(formData.get("reason"));
    const result = await openDispute({
      openedBy: { id: user.id, role: "creator" },
      bookingId,
      kind,
      reason,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath(`/creator/bookings/${bookingId}`);
    return { success: "Dispute opened — an administrator will review it." };
  } catch (err) {
    return fail(err);
  }
}

// ── Messaging & notifications ───────────────────────────────────────────

export async function sendMessageAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    const threadId = z.string().uuid().parse(formData.get("threadId"));
    const body = z.string().max(4000).parse(formData.get("body") ?? "");
    const files = formData
      .getAll("attachments")
      .filter((f): f is File => f instanceof File && f.size > 0);
    const result = await sendMessage({
      senderId: user.id,
      threadId,
      body,
      attachments: files,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath("/creator/messages");
    revalidatePath("/label/messages");
    return { success: "sent" };
  } catch (err) {
    return fail(err);
  }
}

export async function markThreadReadAction(threadId: string): Promise<void> {
  const user = await requireUser();
  await markThreadRead(user.id, z.string().uuid().parse(threadId));
}

export async function markNotificationReadAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = z.string().uuid().parse(formData.get("notificationId"));
  await markNotificationRead(user.id, id);
  revalidatePath("/creator/notifications");
  revalidatePath("/label/notifications");
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const user = await requireUser();
  await markAllNotificationsRead(user.id);
  revalidatePath("/creator/notifications");
  revalidatePath("/label/notifications");
}

/** Start (or resume) Stripe Connect payout onboarding → redirect to Stripe. */
export async function startPayoutOnboardingAction(): Promise<void> {
  const user = await requireCreator();
  let url: string;
  try {
    url = await createOnboardingLink(user.id);
  } catch (err) {
    // Surface a friendly message instead of the global error boundary — the
    // usual cause is the platform's live Connect profile not being finished.
    log.error("Payout onboarding failed to start", { userId: user.id, ...errorFields(err) });
    redirect("/creator/payments?onboarding=error");
  }
  redirect(url);
}
