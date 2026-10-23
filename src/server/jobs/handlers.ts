import "server-only";

import { serviceDb } from "@/server/db/service";
import { deliver, notify, notifyCompany, type NotifyInput } from "@/server/services/notifications";
import { notifyAgency } from "@/server/services/agencies";
import { cancelAuthorizationForBooking, expireHold, placeAuthorization } from "@/server/services/payments";
import { sendOfferDigest } from "@/server/services/offers";
import { cancelBooking, expireBooking } from "@/server/services/bookings";
import { autoReleaseCheckIn, sendNoShowDecisionReminder } from "@/server/services/attendance";
import { remindAccept, remindContent, remindShow } from "@/server/services/reminders";
import { verifyContentSubmission } from "@/server/services/content-verification";
import { geocodeVenueById } from "@/server/services/venues";
import { sendSetupReminderTo } from "@/server/services/setup-reminders";
import { sendCityAlertEmail } from "@/server/services/show-alerts";
import { recoverPaymentOperations } from "@/server/services/payment-recovery";
import { retryUnfinishedWebhooks } from "@/server/services/webhooks";

/**
 * Job kind → handler. Every handler is idempotent (notifications carry the
 * job's key as their dedupe key; state changes are status-guarded), so a job
 * that runs twice after a worker crash has no extra effect. Handlers re-check
 * the record when they run, so work that stopped being due is a no-op.
 */

type Ctx = { key: string };
type Actor = { id: string | null; role: string };
const SYSTEM: Actor = { id: null, role: "system" };

/** Space out calls to a rate-limited service within this worker process. */
const lastCall = new Map<string, number>();
async function pace(service: string, minIntervalMs: number) {
  const wait = (lastCall.get(service) ?? 0) + minIntervalMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall.set(service, Date.now());
}
const EMAIL_INTERVAL_MS = 550; // email provider: ~2 sends a second
const NOMINATIM_INTERVAL_MS = 1100; // 1 request a second
const TIKWM_INTERVAL_MS = 250; // shared quota with other tools

export const JOB_HANDLERS = {
  // Outbox (written by transitions)
  notify: async (p: { input: NotifyInput }) => notify(p.input),
  deliver: async (p: { input: NotifyInput }) => deliver(p.input),
  notify_company: async (p: { companyId: string; input: Omit<NotifyInput, "userId"> }) => notifyCompany(p.companyId, p.input),
  notify_agency: async (p: { agencyId: string; input: Omit<NotifyInput, "userId"> }) => notifyAgency(p.agencyId, p.input),
  offer_digest: async (p: { agencyId: string; showId: string; companyId: string; since: string }) => sendOfferDigest(p),
  release_holds: async (p: { bookingId: string; actor: Actor }) => {
    const result = await cancelAuthorizationForBooking(p.bookingId, p.actor);
    if (!result.ok) throw new Error(result.error);
  },

  // Money (priority 0)
  place_auth: async (p: { authId: string }) => {
    await placeAuthorization(p.authId); // a decline is a business outcome, not a job failure
  },
  expire_hold: async (p: { authId: string }) => {
    await expireHold(p.authId);
  },
  grace_cancel: async (p: { bookingId: string }) => {
    await cancelBooking({ bookingId: p.bookingId, actor: SYSTEM, reason: "Payment method could not be authorized before the deadline" });
  },
  recover_payments: async () => {
    const r = await recoverPaymentOperations();
    if (r.failed) throw new Error(`${r.failed} payment recoveries failed`);
  },
  retry_webhooks: async () => {
    const r = await retryUnfinishedWebhooks();
    if (r.failed) throw new Error(`${r.failed} webhook retries failed`);
  },

  // Bookings (priority 1)
  expire_booking: async (p: { bookingId: string }) => {
    await expireBooking(p.bookingId);
  },
  auto_release: async (p: { bookingId: string; companyId: string }, ctx: Ctx) => {
    await autoReleaseCheckIn(p, ctx.key);
  },

  // Reminders (priority 2-3)
  remind_accept: async (p: { bookingId: string }, ctx: Ctx) => remindAccept(p.bookingId, ctx.key),
  remind_show: async (p: { bookingId: string }, ctx: Ctx) => remindShow(p.bookingId, ctx.key),
  remind_content: async (p: { bookingId: string }, ctx: Ctx) => remindContent(p.bookingId, ctx.key),
  no_show_decision: async (p: { bookingId: string }, ctx: Ctx) => sendNoShowDecisionReminder(p.bookingId, ctx.key),

  // Background checks (priority 6-7)
  verify_content: async (p: { submissionId: string }) => {
    await pace("tikwm", TIKWM_INTERVAL_MS);
    await verifyContentSubmission(p.submissionId, serviceDb());
  },
  geocode: async (p: { venueId: string }) => {
    await pace("nominatim", NOMINATIM_INTERVAL_MS);
    await geocodeVenueById(p.venueId);
  },

  // Marketing email (priority 8-9)
  city_alert_email: async (p: { userId: string; opportunityIds: string[]; cityLabel: string }, ctx: Ctx) => {
    await pace("email", EMAIL_INTERVAL_MS);
    await sendCityAlertEmail(p, ctx.key);
  },
  setup_reminder: async (p: { userId: string }, ctx: Ctx) => {
    await pace("email", EMAIL_INTERVAL_MS);
    await sendSetupReminderTo(p.userId, ctx.key);
  },
} as const;

export type JobKind = keyof typeof JOB_HANDLERS;
