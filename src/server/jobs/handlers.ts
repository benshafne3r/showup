import "server-only";

import { deliver, notify, notifyCompany, type NotifyInput } from "@/server/services/notifications";
import { notifyAgency } from "@/server/services/agencies";
import { cancelAuthorizationForBooking } from "@/server/services/payments";
import { sendOfferDigest } from "@/server/services/offers";

/**
 * Job kind → handler. Every handler is idempotent (notifications carry a
 * dedupe key; hold release is a guarded state change), so a job that runs
 * twice after a worker crash has no extra effect.
 */
export const JOB_HANDLERS = {
  notify: async (p: { input: NotifyInput }) => notify(p.input),
  deliver: async (p: { input: NotifyInput }) => deliver(p.input),
  notify_company: async (p: { companyId: string; input: Omit<NotifyInput, "userId"> }) => notifyCompany(p.companyId, p.input),
  notify_agency: async (p: { agencyId: string; input: Omit<NotifyInput, "userId"> }) => notifyAgency(p.agencyId, p.input),
  offer_digest: async (p: { agencyId: string; showId: string; companyId: string; since: string }) => sendOfferDigest(p),
  release_holds: async (p: { bookingId: string; actor: { id: string | null; role: string } }) => {
    const result = await cancelAuthorizationForBooking(p.bookingId, p.actor);
    if (!result.ok) throw new Error(result.error);
  },
} as const;

export type JobKind = keyof typeof JOB_HANDLERS;
