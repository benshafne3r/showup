"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  requireManagerOf,
  requireManagerWithAgency,
  requireUser,
} from "@/server/auth/guards";
import {
  createAgency,
  inviteCreator,
  removeFromRoster,
  revokeInvite,
  updateAgency,
} from "@/server/services/agencies";
import { createRequest, withdrawRequest } from "@/server/services/requests";
import { createAgencyOnboardingLink } from "@/server/services/connect";
import { serviceDb } from "@/server/db/service";
import { log, errorFields } from "@/server/log";
import { toActionError } from "@/server/action-error";

// "use server" files may only export async functions; declare the type inline.
export type ActionState = { error: string } | { success: string } | null;
export type InviteState = { error: string } | { link: string; email: string } | null;

const fail = (err: unknown): { error: string } => toActionError(err, "manager.action");

const agencySchema = z.object({
  name: z.string().trim().min(2, "Enter your company name").max(120),
  website: z.union([z.literal(""), z.string().url("Enter a full URL, like https://…")]).optional(),
  city: z.string().trim().max(80).optional(),
});

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

const inviteSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the creator's name").max(80),
  email: z.string().trim().email("Enter a valid email address"),
});

export async function inviteCreatorAction(_prev: InviteState, formData: FormData): Promise<InviteState> {
  try {
    const ctx = await requireManagerWithAgency();
    const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const result = await inviteCreator({
      agencyId: ctx.agencyId,
      inviter: { id: ctx.user.id, role: "manager" },
      email: parsed.data.email,
      fullName: parsed.data.fullName,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath("/manager");
    return { link: result.link, email: parsed.data.email.toLowerCase() };
  } catch (err) {
    return fail(err);
  }
}

export async function revokeInviteAction(formData: FormData): Promise<void> {
  const ctx = await requireManagerWithAgency();
  const inviteId = z.string().uuid().parse(formData.get("inviteId"));
  await revokeInvite(ctx.agencyId, inviteId, { id: ctx.user.id, role: "manager" });
  revalidatePath("/manager");
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
