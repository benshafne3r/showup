import "server-only";

import { serviceDb } from "@/server/db/service";
import { expireBooking, cancelBooking } from "./bookings";
import { placeAuthorization } from "./payments";
import { notify } from "./notifications";

/**
 * Scheduled job runner, invoked by /api/cron/run (Vercel Cron compatible)
 * or manually by an admin. Every step is idempotent: state claims are
 * status-guarded and reminders are deduplicated against notification history.
 */
export async function runScheduledJobs(): Promise<Record<string, number>> {
  const results: Record<string, number> = {
    expiredAcceptances: 0,
    authorizationsPlaced: 0,
    authorizationsFailed: 0,
    graceCancellations: 0,
    approvalExpiringReminders: 0,
    upcomingShowReminders: 0,
    contentDeadlineReminders: 0,
  };
  const db = serviceDb();
  const nowIso = new Date().toISOString();

  // 1. Expire bookings whose acceptance window lapsed.
  const { data: overdue } = await db
    .from("bookings")
    .select("id")
    .in("status", ["awaiting_acceptance", "awaiting_payment_method"])
    .lt("acceptance_deadline_at", nowIso)
    .limit(200);
  for (const booking of overdue ?? []) {
    if (await expireBooking(booking.id)) results.expiredAcceptances++;
  }

  // 2. Place authorizations that are due.
  const { data: dueAuths } = await db
    .from("authorization_records")
    .select("id")
    .eq("status", "scheduled")
    .lte("scheduled_for", nowIso)
    .limit(200);
  for (const auth of dueAuths ?? []) {
    const result = await placeAuthorization(auth.id);
    if (result.ok) results.authorizationsPlaced++;
    else results.authorizationsFailed++;
  }

  // 3. Cancel bookings whose payment-fix grace period lapsed.
  const { data: lapsedGrace } = await db
    .from("authorization_records")
    .select("id, booking_id")
    .eq("status", "failed")
    .lt("grace_deadline_at", nowIso)
    .limit(200);
  for (const auth of lapsedGrace ?? []) {
    const result = await cancelBooking({
      bookingId: auth.booking_id,
      actor: { id: null, role: "system" },
      reason: "Payment method could not be authorized before the deadline",
    });
    if (result.ok) results.graceCancellations++;
  }

  // 4. Approval-expiring reminders (≤ 6h left, not yet reminded).
  const sixHours = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
  const { data: expiring } = await db
    .from("bookings")
    .select("id, creator_id, acceptance_deadline_at")
    .eq("status", "awaiting_acceptance")
    .lt("acceptance_deadline_at", sixHours)
    .gt("acceptance_deadline_at", nowIso)
    .limit(200);
  for (const booking of expiring ?? []) {
    if (await alreadyNotified(booking.creator_id, "approval_expiring", `/creator/bookings/${booking.id}`)) continue;
    await notify({
      userId: booking.creator_id,
      type: "approval_expiring",
      title: "Your approval expires soon",
      body: "Accept your spot before the window closes or it will be offered to someone else.",
      link: `/creator/bookings/${booking.id}`,
    });
    results.approvalExpiringReminders++;
  }

  // 5. Upcoming-show reminders (show is tomorrow, confirmed bookings).
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const { data: upcoming } = await db
    .from("bookings")
    .select("id, creator_id, shows!inner(date, artists(name))")
    .in("status", ["confirmed", "authorization_failed"])
    .eq("shows.date", tomorrow)
    .limit(200);
  for (const booking of upcoming ?? []) {
    if (await alreadyNotified(booking.creator_id, "upcoming_show_reminder", `/creator/bookings/${booking.id}`)) continue;
    await notify({
      userId: booking.creator_id,
      type: "upcoming_show_reminder",
      title: `${booking.shows?.artists?.name ?? "Your show"} is tomorrow!`,
      body: "Don't forget to check in at the venue — attending releases your hold.",
      link: `/creator/bookings/${booking.id}`,
    });
    results.upcomingShowReminders++;
  }

  // 6. Content deadline reminders (≤ 48h, content still pending).
  const twoDays = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
  const { data: contentDue } = await db
    .from("bookings")
    .select("id, creator_id")
    .in("content_state", ["pending", "revision_requested"])
    .in("status", ["attended", "confirmed"])
    .lt("content_deadline_at", twoDays)
    .gt("content_deadline_at", nowIso)
    .limit(200);
  for (const booking of contentDue ?? []) {
    if (await alreadyNotified(booking.creator_id, "content_deadline_approaching", `/creator/bookings/${booking.id}`)) continue;
    await notify({
      userId: booking.creator_id,
      type: "content_deadline_approaching",
      title: "Content deadline approaching",
      body: "Submit your deliverables soon to earn your creator payment.",
      link: `/creator/bookings/${booking.id}`,
    });
    results.contentDeadlineReminders++;
  }

  return results;
}

async function alreadyNotified(userId: string, type: string, link: string): Promise<boolean> {
  const { data } = await serviceDb()
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("type", type as never)
    .eq("link", link)
    .limit(1)
    .maybeSingle();
  return !!data;
}
