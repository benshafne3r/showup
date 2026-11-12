"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  AuthError,
  requireManagerOf,
  requireManagerWithAgency,
  requireUser,
} from "@/server/auth/guards";
import {
  changeAgencyMemberRole,
  inviteAgencyMember,
  removeAgencyMember,
  revokeAgencyInvite,
} from "@/server/services/agency-team";
import {
  addManagedCreator,
  createAgency,
  findRosterCandidate,
  removeFromRoster,
  updateAgency,
  type RosterCandidate,
} from "@/server/services/agencies";
import { createRequest, withdrawRequest } from "@/server/services/requests";
import { acceptBooking, passOnBooking } from "@/server/services/bookings";
import {
  attachAgencyPaymentMethod,
  finishCardSetup,
  startCardSetup,
} from "@/server/services/payments";
import { createAgencyOnboardingLink } from "@/server/services/connect";
import { serviceDb } from "@/server/db/service";
import { log, errorFields } from "@/server/log";
import { toActionError } from "@/server/action-error";

// "use server" files may only export async functions; declare the type inline.
export type ActionState = { error: string } | { success: string } | null;

const fail = (err: unknown): { error: string } => toActionError(err, "manager.action");

const agencySchema = z.object({
  name: z.string().trim().min(2, "Enter your company name").max(120),
  website: z.union([z.literal(""), z.string().url("Enter a full URL, like https://…")]).optional(),
  city: z.string().trim().max(80).optional(),
});

// ── Team (owners and admins manage it) ──────────────────────────────────

async function requireAgencyAdmin() {
  const ctx = await requireManagerWithAgency();
  if (ctx.memberRole === "member") throw new AuthError("Only owners and admins can manage the team");
  return ctx;
}

export async function inviteAgencyMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const ctx = await requireAgencyAdmin();
    const email = z.string().trim().email("Enter a valid email").parse(formData.get("email"));
    const role = z.enum(["admin", "member"]).parse(formData.get("role") ?? "member");
    const result = await inviteAgencyMember({
      agencyId: ctx.agencyId,
      inviter: { id: ctx.user.id, role: "manager" },
      email,
      role,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath("/manager/settings");
    return { success: `Invite sent to ${email}` };
  } catch (err) {
    return fail(err);
  }
}

export async function changeAgencyMemberRoleAction(formData: FormData): Promise<void> {
  const ctx = await requireAgencyAdmin();
  await changeAgencyMemberRole({
    agencyId: ctx.agencyId,
    actor: { id: ctx.user.id, role: "manager" },
    memberUserId: z.string().uuid().parse(formData.get("memberUserId")),
    newRole: z.enum(["admin", "member"]).parse(formData.get("newRole")),
  });
  revalidatePath("/manager/settings");
}

export async function removeAgencyMemberAction(formData: FormData): Promise<void> {
  const ctx = await requireAgencyAdmin();
  await removeAgencyMember({
    agencyId: ctx.agencyId,
    actor: { id: ctx.user.id, role: "manager" },
    memberUserId: z.string().uuid().parse(formData.get("memberUserId")),
  });
  revalidatePath("/manager/settings");
}

export async function revokeAgencyInviteAction(formData: FormData): Promise<void> {
  const ctx = await requireAgencyAdmin();
  await revokeAgencyInvite({
    agencyId: ctx.agencyId,
    actor: { id: ctx.user.id, role: "manager" },
    inviteId: z.string().uuid().parse(formData.get("inviteId")),
  });
  revalidatePath("/manager/settings");
}

// ── Onboarding / settings ───────────────────────────────────────────────

export async function createAgencyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let created = false;
  try {
    const user = await requireUser();
    if (user.role !== "manager") return { error: "Management account required" };
    const parsed = agencySchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const result = await createAgency({ userId: user.id, ...parsed.data });
    if (!result.ok) return { error: result.error };
    created = true;
  } catch (err) {
    return fail(err);
  }
  if (created) {
    // The layout rendered without an agency during onboarding; make it
    // re-render so the app shell (nav + padding) appears after the redirect.
    revalidatePath("/manager", "layout");
    redirect("/manager?welcome=1");
  }
  return null;
}

export async function updateAgencyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const ctx = await requireManagerWithAgency();
    if (ctx.memberRole === "member") return { error: "Only the owner or an admin can edit company details" };
    const parsed = agencySchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    await updateAgency(ctx.agencyId, { id: ctx.user.id, role: "manager" }, parsed.data);
    revalidatePath("/manager", "layout");
    return { success: "Saved" };
  } catch (err) {
    return fail(err);
  }
}

// ── Roster ──────────────────────────────────────────────────────────────

/** "Add creator", step 1: look up a pasted TikTok link or @handle. */
export async function findCreatorAction(
  input: string,
): Promise<{ candidate: RosterCandidate } | { error: string }> {
  try {
    const ctx = await requireManagerWithAgency();
    const result = await findRosterCandidate(ctx.agencyId, z.string().max(300).parse(input));
    return result.ok ? { candidate: result.candidate } : { error: result.error };
  } catch (err) {
    return fail(err);
  }
}

const addCreatorSchema = z.object({
  handle: z.string().trim().min(1).max(300),
  name: z.string().trim().min(1, "Add their name").max(80),
  location: z.string().trim().max(120),
  genres: z.array(z.string().trim().max(40)).max(8),
});

/** "Add creator", step 2: add them to the roster as a managed profile (no email is sent). */
export async function addCreatorAction(input: z.input<typeof addCreatorSchema>): Promise<ActionState> {
  try {
    const ctx = await requireManagerWithAgency();
    const parsed = addCreatorSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const result = await addManagedCreator({
      agencyId: ctx.agencyId,
      actor: { id: ctx.user.id, role: "manager" },
      handleInput: parsed.data.handle,
      name: parsed.data.name,
      location: parsed.data.location,
      genres: parsed.data.genres,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath("/manager", "layout");
    return { success: `${parsed.data.name} is on your roster` };
  } catch (err) {
    return fail(err);
  }
}

export async function removeCreatorAction(formData: FormData): Promise<void> {
  const creatorId = z.string().uuid().parse(formData.get("creatorId"));
  const ctx = await requireManagerOf(creatorId);
  await removeFromRoster({ agencyId: ctx.agencyId, actor: { id: ctx.user.id, role: "manager" }, creatorId });
  revalidatePath("/manager");
  redirect("/manager");
}

// ── Requests on a creator's behalf ──────────────────────────────────────

const requestSchema = z.object({
  creatorId: z.string().uuid("Choose a creator"),
  opportunityId: z.string().uuid(),
  ticketCount: z.coerce.number().pipe(z.union([z.literal(1), z.literal(2)])),
  message: z.string().max(1000),
});

export async function requestForCreatorAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let ok = false;
  try {
    const parsed = requestSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const ctx = await requireManagerOf(parsed.data.creatorId);
    const result = await createRequest({
      creatorId: parsed.data.creatorId,
      opportunityId: parsed.data.opportunityId,
      ticketCount: parsed.data.ticketCount as 1 | 2,
      message: parsed.data.message,
      actor: { id: ctx.user.id, role: "manager" },
    });
    if (!result.ok) return { error: result.error };
    ok = true;
  } catch (err) {
    return fail(err);
  }
  if (ok) {
    revalidatePath("/manager/messages");
    redirect("/manager/messages?tab=requests&submitted=1");
  }
  return null;
}

export async function withdrawForCreatorAction(formData: FormData): Promise<void> {
  const requestId = z.string().uuid().parse(formData.get("requestId"));
  const { data: request } = await serviceDb()
    .from("show_requests")
    .select("creator_id")
    .eq("id", requestId)
    .maybeSingle();
  if (!request) return;
  const ctx = await requireManagerOf(request.creator_id);
  await withdrawRequest(request.creator_id, requestId, { id: ctx.user.id, role: "manager" });
  revalidatePath("/manager/messages");
}

// ── Accepting for a creator (hold on the agency's card) ─────────────────

async function rosterBooking(bookingId: string) {
  const { data: booking } = await serviceDb()
    .from("bookings")
    .select("creator_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) throw new Error("Booking not found");
  const ctx = await requireManagerOf(booking.creator_id);
  return { ctx, creatorId: booking.creator_id };
}

export async function acceptForCreatorAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const bookingId = z.string().uuid().parse(formData.get("bookingId"));
    const { ctx, creatorId } = await rosterBooking(bookingId);
    const result = await acceptBooking({
      creatorId,
      bookingId,
      agreedToTerms: formData.get("agreeTerms") === "on",
      agency: { agencyId: ctx.agencyId, agencyName: ctx.agencyName, actorId: ctx.user.id },
    });
    if (!result.ok) return { error: result.error };
    revalidatePath("/manager", "layout");
    return { success: "Accepted. The hold goes on your card a couple of days before the show." };
  } catch (err) {
    return fail(err);
  }
}

/** Accept several waiting invites at once (one hold each, on the agency's card). */
export async function acceptAllForCreatorsAction(
  bookingIds: string[],
): Promise<{ accepted: number; failed: string[] } | { error: string }> {
  try {
    const ids = z.array(z.string().uuid()).min(1).max(100).parse(bookingIds);
    let accepted = 0;
    const failed: string[] = [];
    for (const bookingId of ids) {
      const { ctx, creatorId } = await rosterBooking(bookingId);
      const result = await acceptBooking({
        creatorId,
        bookingId,
        agreedToTerms: true, // confirmed in the dialog
        agency: { agencyId: ctx.agencyId, agencyName: ctx.agencyName, actorId: ctx.user.id },
      });
      if (result.ok) accepted++;
      else failed.push(result.error);
    }
    revalidatePath("/manager", "layout");
    return { accepted, failed };
  } catch (err) {
    const failure = fail(err);
    return failure && "error" in failure ? failure : { error: "Something went wrong" };
  }
}

export async function passForCreatorAction(formData: FormData): Promise<void> {
  const bookingId = z.string().uuid().parse(formData.get("bookingId"));
  const { ctx } = await rosterBooking(bookingId);
  await passOnBooking({
    bookingId,
    agency: { agencyId: ctx.agencyId, agencyName: ctx.agencyName, actorId: ctx.user.id },
  });
  revalidatePath("/manager", "layout");
}

// ── The agency's card (covers holds for its creators) ───────────────────

const agencyCardSchema = z.object({
  cardNumber: z.string().regex(/^[\d\s]{13,23}$/, "Enter a valid card number"),
  expMonth: z.coerce.number().int().min(1, "Month").max(12, "Month"),
  expYear: z.coerce.number().int().min(2024).max(2050),
  cvc: z.string().regex(/^\d{3,4}$/, "Enter the 3–4 digit CVC"),
});

export async function addAgencyCardAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const ctx = await requireManagerWithAgency();
    if (ctx.memberRole === "member") return { error: "Ask your company owner to add the card" };
    const parsed = agencyCardSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const result = await attachAgencyPaymentMethod(ctx.agencyId, ctx.user.id, parsed.data);
    if (!result.ok) return { error: result.error };
    revalidatePath("/manager", "layout");
    return { success: "Card verified and saved" };
  } catch (err) {
    return fail(err);
  }
}

/** The agency's card through Stripe's card setup (see startCardSetup). */
export async function startAgencyCardSetupAction(): Promise<{ clientSecret: string } | { error: string }> {
  try {
    const ctx = await requireManagerWithAgency();
    if (ctx.memberRole === "member") return { error: "Ask your company owner to add the card" };
    const result = await startCardSetup(ctx.user.id, { agencyId: ctx.agencyId });
    return result.ok ? { clientSecret: result.clientSecret } : { error: result.error };
  } catch (err) {
    const failed = fail(err);
    return failed && "error" in failed ? failed : { error: "Something went wrong" };
  }
}

export async function finishAgencyCardSetupAction(setupIntentId: string): Promise<ActionState> {
  try {
    const ctx = await requireManagerWithAgency();
    if (ctx.memberRole === "member") return { error: "Ask your company owner to add the card" };
    const id = z.string().startsWith("seti_").max(255).parse(setupIntentId);
    const result = await finishCardSetup(ctx.user.id, id, { agencyId: ctx.agencyId });
    if (!result.ok) return { error: result.error };
    revalidatePath("/manager", "layout");
    return { success: "Card verified and saved" };
  } catch (err) {
    return fail(err);
  }
}

// ── Payouts ─────────────────────────────────────────────────────────────

/** Start (or resume) Stripe Connect onboarding for the agency → redirect to Stripe. */
export async function startAgencyPayoutOnboardingAction(): Promise<void> {
  const ctx = await requireManagerWithAgency();
  if (ctx.memberRole === "member") redirect("/manager/payments?onboarding=forbidden");
  let url: string;
  try {
    url = await createAgencyOnboardingLink(ctx.agencyId);
  } catch (err) {
    log.error("Agency payout onboarding failed to start", { agencyId: ctx.agencyId, ...errorFields(err) });
    redirect("/manager/payments?onboarding=error");
  }
  redirect(url);
}
