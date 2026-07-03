"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, AuthError } from "@/server/auth/guards";
import { serviceDb } from "@/server/db/service";
import { audit } from "@/server/services/audit";
import { notify } from "@/server/services/notifications";
import { resolveDispute } from "@/server/services/disputes";
import { cancelBooking } from "@/server/services/bookings";
import { cancelShow } from "@/server/services/catalog";
import {
  releaseAuthorization,
  captureAuthorization,
  payoutCreatorPayment,
} from "@/server/services/payments";
import { updatePlatformSetting } from "@/server/services/settings";
import { runScheduledJobs } from "@/server/services/jobs";

export type ActionState = { error: string } | { success: string } | null;

function fail(err: unknown): ActionState {
  if (err instanceof AuthError) return { error: err.message };
  if (err instanceof Error && err.message) return { error: err.message };
  return { error: "Something went wrong." };
}

// ── Users & companies ───────────────────────────────────────────────────

export async function setUserStatusAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const userId = z.string().uuid().parse(formData.get("userId"));
  const status = z.enum(["active", "suspended"]).parse(formData.get("status"));
  await serviceDb()
    .from("users")
    .update({
      status,
      suspended_at: status === "suspended" ? new Date().toISOString() : null,
    })
    .eq("id", userId);
  await audit({
    actorId: admin.id,
    actorRole: "admin",
    action: `user.${status === "suspended" ? "suspend" : "reinstate"}`,
    entityType: "user",
    entityId: userId,
  });
  revalidatePath("/admin/users");
}

export async function verifyUserAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const userId = z.string().uuid().parse(formData.get("userId"));
  await serviceDb()
    .from("users")
    .update({ verified_at: new Date().toISOString() })
    .eq("id", userId);
  await notify({
    userId,
    type: "account_verified",
    title: "Your account is verified",
    body: "Your profile now shows a verified badge to partners.",
  });
  await audit({
    actorId: admin.id,
    actorRole: "admin",
    action: "user.verify",
    entityType: "user",
    entityId: userId,
  });
  revalidatePath("/admin/users");
}

export async function setCompanyStatusAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const companyId = z.string().uuid().parse(formData.get("companyId"));
  const action = z.enum(["verify", "suspend", "reinstate"]).parse(formData.get("action"));
  const patch =
    action === "verify"
      ? { verified_at: new Date().toISOString() }
      : action === "suspend"
        ? { suspended_at: new Date().toISOString() }
        : { suspended_at: null };
  await serviceDb().from("companies").update(patch).eq("id", companyId);
  await audit({
    actorId: admin.id,
    actorRole: "admin",
    action: `company.${action}`,
    entityType: "company",
    entityId: companyId,
    companyId,
  });
  revalidatePath("/admin/companies");
}

// ── Bookings, shows, money oversight ────────────────────────────────────

export async function adminCancelBookingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const bookingId = z.string().uuid().parse(formData.get("bookingId"));
    const reason = z.string().min(3).max(300).parse(formData.get("reason"));
    const result = await cancelBooking({
      bookingId,
      actor: { id: admin.id, role: "admin" },
      reason,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath("/admin/bookings");
    return { success: "Booking canceled" };
  } catch (err) {
    return fail(err);
  }
}

export async function adminCancelShowAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const showId = z.string().uuid().parse(formData.get("showId"));
    const reason = z.string().min(3).max(300).parse(formData.get("reason"));
    const { data: show } = await serviceDb()
      .from("shows")
      .select("company_id")
      .eq("id", showId)
      .single();
    if (!show) return { error: "Show not found" };
    const result = await cancelShow({
      showId,
      actor: { id: admin.id, role: "admin" },
      companyId: show.company_id,
      reason,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath("/admin/shows");
    return { success: `Show canceled (${result.canceledBookings} bookings released)` };
  } catch (err) {
    return fail(err);
  }
}

export async function adminReleaseHoldAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const authId = z.string().uuid().parse(formData.get("authorizationId"));
    const result = await releaseAuthorization(authId, { id: admin.id, role: "admin" });
    if (!result.ok) return { error: result.error };
    revalidatePath("/admin/payments");
    return { success: "Hold released" };
  } catch (err) {
    return fail(err);
  }
}

export async function adminCaptureHoldAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const authId = z.string().uuid().parse(formData.get("authorizationId"));
    const result = await captureAuthorization(authId, { id: admin.id, role: "admin" });
    if (!result.ok) return { error: result.error };
    revalidatePath("/admin/payments");
    return { success: "Hold captured" };
  } catch (err) {
    return fail(err);
  }
}

export async function adminPayoutAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const bookingId = z.string().uuid().parse(formData.get("bookingId"));
    const result = await payoutCreatorPayment(bookingId, { id: admin.id, role: "admin" });
    if (!result.ok) return { error: result.error };
    revalidatePath("/admin/payments");
    return { success: "Payout released" };
  } catch (err) {
    return fail(err);
  }
}

export async function adminTogglePayoutPauseAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const recordId = z.string().uuid().parse(formData.get("recordId"));
  const pause = formData.get("pause") === "1";
  await serviceDb()
    .from("creator_payment_records")
    .update(
      pause
        ? { paused_at: new Date().toISOString(), paused_by: admin.id }
        : { paused_at: null, paused_by: null },
    )
    .eq("id", recordId);
  await audit({
    actorId: admin.id,
    actorRole: "admin",
    action: pause ? "creator_payment.pause" : "creator_payment.unpause",
    entityType: "creator_payment_record",
    entityId: recordId,
  });
  revalidatePath("/admin/payments");
}

export async function adminCancelPayoutAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const recordId = z.string().uuid().parse(formData.get("recordId"));
  await serviceDb()
    .from("creator_payment_records")
    .update({ status: "canceled", canceled_at: new Date().toISOString() })
    .eq("id", recordId)
    .in("status", ["pending_fulfillment", "ready", "failed", "disputed"]);
  await audit({
    actorId: admin.id,
    actorRole: "admin",
    action: "creator_payment.cancel",
    entityType: "creator_payment_record",
    entityId: recordId,
  });
  revalidatePath("/admin/payments");
}

// ── Disputes ────────────────────────────────────────────────────────────

export async function resolveDisputeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const disputeId = z.string().uuid().parse(formData.get("disputeId"));
    const resolution = z
      .enum(["release_hold", "capture_hold", "pay_creator", "deny_payment", "no_action"])
      .parse(formData.get("resolution"));
    const notes = z.string().min(5, "Add resolution notes").max(2000).parse(formData.get("notes"));
    const result = await resolveDispute({
      admin: { id: admin.id, role: "admin" },
      disputeId,
      resolution,
      notes,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath("/admin/disputes");
    return { success: "Dispute resolved" };
  } catch (err) {
    return fail(err);
  }
}

// ── Platform settings & jobs ────────────────────────────────────────────

const settingsSchema = z.object({
  depositPercentageTemplates: z
    .string()
    .transform((s) => s.split(",").map((x) => parseInt(x.trim(), 10)))
    .pipe(z.array(z.number().int().min(1).max(100)).min(1).max(8)),
  acceptanceWindowHours: z.coerce.number().int().min(1).max(168),
  authorizationWindowDays: z.coerce.number().int().min(0).max(30),
  paymentMethodGraceDays: z.coerce.number().int().min(0).max(30),
  contentDeadlineDefaultDays: z.coerce.number().int().min(0).max(90),
});

export async function updateSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const settings = parsed.data;
    await Promise.all([
      updatePlatformSetting("depositPercentageTemplates", settings.depositPercentageTemplates, admin.id),
      updatePlatformSetting("acceptanceWindowHours", settings.acceptanceWindowHours, admin.id),
      updatePlatformSetting("authorizationWindowDays", settings.authorizationWindowDays, admin.id),
      updatePlatformSetting("paymentMethodGraceDays", settings.paymentMethodGraceDays, admin.id),
      updatePlatformSetting("contentDeadlineDefaultDays", settings.contentDeadlineDefaultDays, admin.id),
    ]);
    await audit({
      actorId: admin.id,
      actorRole: "admin",
      action: "platform_settings.update",
      entityType: "platform_settings",
      metadata: settings,
    });
    revalidatePath("/admin/settings");
    return { success: "Settings saved" };
  } catch (err) {
    return fail(err);
  }
}

export async function runJobsNowAction(): Promise<void> {
  const admin = await requireAdmin();
  const results = await runScheduledJobs();
  await audit({
    actorId: admin.id,
    actorRole: "admin",
    action: "jobs.manual_run",
    entityType: "platform",
    metadata: results,
  });
  revalidatePath("/admin");
}
