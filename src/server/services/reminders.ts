import "server-only";

import { serviceDb } from "@/server/db/service";
import { notify } from "./notifications";

/**
 * Creator reminders, one job per booking (the scheduler selects who's due in
 * SQL). Each re-checks the booking when it runs and carries the job's key as
 * the notification's idempotency key, so a retried job never repeats itself.
 */

async function booking(id: string) {
  const { data, error } = await serviceDb()
    .from("bookings")
    .select("id, status, creator_id, content_state, acceptance_deadline_at, content_deadline_at, shows(date, artists(name))")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`load booking: ${error.message}`);
  return data;
}

/** "Your approval expires soon" (≤ 6 hours left to accept). */
export async function remindAccept(bookingId: string, dedupeKey: string): Promise<boolean> {
  const b = await booking(bookingId);
  if (!b || b.status !== "awaiting_acceptance" || new Date(b.acceptance_deadline_at) < new Date()) return false;
  await notify({
    userId: b.creator_id,
    type: "approval_expiring",
    title: "Your approval expires soon",
    body: "Accept your spot before the window closes or it will be offered to someone else.",
    link: `/creator/bookings/${b.id}`,
    dedupeKey,
    strict: true,
  });
  return true;
}

/** "Your show is tomorrow" for confirmed bookings. */
export async function remindShow(bookingId: string, dedupeKey: string): Promise<boolean> {
  const b = await booking(bookingId);
  if (!b || !["confirmed", "authorization_failed"].includes(b.status)) return false;
  await notify({
    userId: b.creator_id,
    type: "upcoming_show_reminder",
    title: `${b.shows?.artists?.name ?? "Your show"} is tomorrow!`,
    body: "Don't forget to check in at the venue. Attending releases your hold.",
    link: `/creator/bookings/${b.id}`,
    dedupeKey,
    strict: true,
  });
  return true;
}

/** Content due within 48 hours and not submitted yet. */
export async function remindContent(bookingId: string, dedupeKey: string): Promise<boolean> {
  const b = await booking(bookingId);
  if (!b || !["pending", "revision_requested"].includes(b.content_state) || !["attended", "confirmed"].includes(b.status)) {
    return false;
  }
  await notify({
    userId: b.creator_id,
    type: "content_deadline_approaching",
    title: "Content deadline approaching",
    body: "Submit your deliverables soon to earn your creator payment.",
    link: `/creator/bookings/${b.id}`,
    dedupeKey,
    strict: true,
  });
  return true;
}
