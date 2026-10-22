import "server-only";

import { serviceDb } from "@/server/db/service";
import { audit } from "./audit";
import { notify } from "./notifications";
import { agencyForCreator } from "./agencies";
import { getPlatformSettings } from "./settings";
import { enforceRateLimit } from "./rate-limit";
import { authorizationAmountCents, formatCents } from "@/lib/money";
import { formatShowDateLong } from "@/lib/dates";
import { runOutboxNow, type OutboxJob } from "@/server/jobs/queue";
import { deliverJob, keysOf, notifyAgencyJob, notifyCompanyJob, notifyJob } from "@/server/jobs/outbox";
import { randomUUID } from "node:crypto";

/**
 * Request lifecycle: create → (approve | reject | waitlist) → booking.
 * Creating a request (create_request_tx) and approving it
 * (approve_request_tx) are each ONE transaction: request, ticket rows,
 * thread, inventory and booking change together or not at all, and their
 * notifications are written to the job outbox in the same transaction.
 * Approval can't oversell (the opportunity row is locked and checked), and
 * snapshots the economics onto the booking so later edits never change
 * agreed terms.
 */

export async function createRequest(input: {
  creatorId: string;
  opportunityId: string;
  ticketCount: 1 | 2;
  message: string;
  /** Who's asking — the creator, or a manager on their roster. Defaults to the creator. */
  actor?: { id: string; role: "creator" | "manager" };
}): Promise<{ ok: true; requestId: string } | { ok: false; error: string }> {
  const actor = input.actor ?? { id: input.creatorId, role: "creator" as const };
  await enforceRateLimit("request.create", input.creatorId);
  const db = serviceDb();

  const { data: opp } = await db
    .from("show_opportunities")
    .select(
      "id, show_id, company_id, plus_one_allowed, application_deadline, published_at, tickets_total, tickets_claimed, shows(status, date, title, artists(name), venues(name, city))",
    )
    .eq("id", input.opportunityId)
    .single();
  if (!opp || !opp.published_at) return { ok: false, error: "Opportunity not found" };
  if (opp.shows!.status !== "published") return { ok: false, error: "This show is not open for requests" };
  if (new Date(opp.application_deadline) < new Date()) {
    return { ok: false, error: "The application deadline has passed" };
  }
  if (input.ticketCount === 2 && !opp.plus_one_allowed) {
    return { ok: false, error: "A +1 is not available for this show" };
  }
  if (opp.tickets_claimed >= opp.tickets_total) {
    return { ok: false, error: "All tickets for this show have been claimed" };
  }

  const requestId = randomUUID();
  const artistName = opp.shows!.artists?.name ?? "the artist";
  const agency = await agencyForCreator(input.creatorId);
  const tickets = `${input.ticketCount} ticket${input.ticketCount > 1 ? "s" : ""}`;
  // The email carries the whole request so the team can triage from their inbox.
  const [{ data: creatorUser }, { data: creatorProfile }] = await Promise.all([
    db.from("users").select("full_name").eq("id", input.creatorId).single(),
    db
      .from("creator_profiles")
      .select("city, audience_size, avg_views, creator_social_accounts(platform, handle, followers)")
      .eq("user_id", input.creatorId)
      .maybeSingle(),
  ]);
  const creatorName = creatorUser?.full_name || "A creator";
  const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
  const socials = (creatorProfile?.creator_social_accounts ?? [])
    .sort((a, b) => b.followers - a.followers)
    .slice(0, 3)
    .map((sa) => `${sa.platform} @${sa.handle} (${compact.format(sa.followers)})`)
    .join(", ");
  const venue = opp.shows!.venues;
  const jobs: OutboxJob[] = [
    notifyCompanyJob(`request:${requestId}:submitted`, opp.company_id, {
      type: "request_submitted",
      title: `${creatorName} requested tickets for ${artistName}`,
      body: agency
        ? `${agency.name} requested ${tickets} for ${artistName} for ${creatorName}, one of their creators.`
        : `${creatorName} requested ${tickets} for ${artistName}.`,
      link: `/label/requests/${requestId}`,
      email: {
        details: [
          { label: "Show", value: `${artistName}${venue ? ` · ${venue.name}, ${venue.city}` : ""}` },
          { label: "Date", value: formatShowDateLong(opp.shows!.date) },
          { label: "Tickets", value: input.ticketCount === 2 ? "2 (creator + a guest)" : "1" },
          { label: "Creator", value: [creatorName, creatorProfile?.city].filter(Boolean).join(" · ") },
          ...(creatorProfile?.audience_size
            ? [{
                label: "Audience",
                value: `${compact.format(creatorProfile.audience_size)} followers · ~${compact.format(creatorProfile.avg_views)} avg views`,
              }]
            : []),
          ...(socials ? [{ label: "Socials", value: socials }] : []),
          ...(agency ? [{ label: "Managed by", value: agency.name }] : []),
        ],
        quote: input.message.trim()
          ? { from: agency && actor.role === "manager" ? agency.name : creatorName, text: input.message.trim() }
          : undefined,
        ctaLabel: "Review request",
      },
    }),
  ];
  // Keep the other side of a managed relationship in the loop.
  if (agency && actor.role === "creator") {
    jobs.push(
      notifyAgencyJob(`request:${requestId}:submitted:agency`, agency.id, {
        type: "request_submitted",
        title: `${creatorName} requested tickets`,
        body: `${tickets} for ${artistName} on ${opp.shows!.date}.`,
        link: "/manager/messages?tab=requests",
      }),
    );
  } else if (agency && actor.role === "manager") {
    // deliver, not notify: the agency already knows — it made the request.
    jobs.push(
      deliverJob(`request:${requestId}:submitted:creator`, {
        userId: input.creatorId,
        type: "request_submitted",
        title: `${agency.name} requested tickets for you`,
        body: `${tickets} for ${artistName} on ${opp.shows!.date}. If approved, ${agency.name} accepts the booking for you.`,
        link: "/creator/messages?tab=requests",
      }),
    );
  }

  const { error } = await db.rpc("create_request_tx", {
    p_request_id: requestId,
    p_opportunity_id: opp.id,
    p_creator_id: input.creatorId,
    p_ticket_count: input.ticketCount,
    p_message: input.message,
    p_offered: false,
    p_jobs: jobs as never,
  });
  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error:
          actor.role === "manager"
            ? "That creator already has an active request for this show"
            : "You already have an active request for this show",
      };
    }
    throw new Error(`create request: ${error.message}`);
  }
  await runOutboxNow(keysOf(jobs));
  const request = { id: requestId };
  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "request.create",
    entityType: "show_request",
    entityId: request.id,
    companyId: opp.company_id,
    metadata: { ticketCount: input.ticketCount, creatorId: input.creatorId },
  });
  return { ok: true, requestId: request.id };
}

export async function withdrawRequest(
  creatorId: string,
  requestId: string,
  actor: { id: string; role: "creator" | "manager" } = { id: creatorId, role: "creator" },
) {
  const db = serviceDb();
  const { data: claimed } = await db
    .from("show_requests")
    .update({ status: "withdrawn", withdrawn_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("creator_id", creatorId)
    .in("status", ["pending", "waitlisted"])
    .select("id, company_id")
    .maybeSingle();
  if (!claimed) return { ok: false as const, error: "Request can no longer be withdrawn" };
  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "request.withdraw",
    entityType: "show_request",
    entityId: requestId,
    companyId: claimed.company_id,
  });
  return { ok: true as const };
}

/**
 * Approve a request: claim it, reserve inventory, create the booking with a
 * terms snapshot and the 24h acceptance deadline. `confirmedTicketCount`
 * lets the label approve a +1 request as a single ticket.
 */
export async function approveRequest(input: {
  requestId: string;
  reviewer: { id: string; role: string };
  companyId: string;
  confirmedTicketCount?: 1 | 2;
  /** Skip the "you're approved" notification (label invites send their own). */
  quiet?: boolean;
}): Promise<{ ok: true; bookingId: string; acceptBy: string } | { ok: false; error: string }> {
  const db = serviceDb();
  const { data: request } = await db
    .from("show_requests")
    .select("id, creator_id, ticket_count, show_opportunities(stated_ticket_value_cents, deposit_percentage, shows(artists(name)))")
    .eq("id", input.requestId)
    .eq("company_id", input.companyId)
    .maybeSingle();
  if (!request) return { ok: false, error: "Request not found" };

  const settings = await getPlatformSettings();
  const bookingId = randomUUID();
  const ticketCount = input.confirmedTicketCount ?? (request.ticket_count as 1 | 2);
  const opp = request.show_opportunities;
  // For the message only; the transaction computes the authoritative amount.
  const holdCents = opp ? authorizationAmountCents(opp.stated_ticket_value_cents, ticketCount, opp.deposit_percentage) : 0;
  const artistName = opp?.shows?.artists?.name ?? "the show";
  const jobs: OutboxJob[] = input.quiet
    ? []
    : [
        notifyJob(`booking:${bookingId}:approved`, {
          userId: request.creator_id,
          type: "request_approved",
          title: `You're approved for ${artistName}!`,
          body: `You have ${settings.acceptanceWindowHours} hours to review the terms and secure your spot. The temporary hold will be ${formatCents(holdCents)} across ${ticketCount} ticket${ticketCount > 1 ? "s" : ""}.`,
          link: `/creator/bookings/${bookingId}`,
        }, input.companyId),
      ];

  const { data, error } = await db.rpc("approve_request_tx", {
    p_request_id: input.requestId,
    p_company_id: input.companyId,
    p_reviewer: input.reviewer.id,
    p_ticket_count: ticketCount,
    p_booking_id: bookingId,
    p_accept_hours: settings.acceptanceWindowHours,
    p_jobs: jobs as never,
  });
  if (error) {
    const known: Record<string, string> = {
      request_not_found: "Request not found",
      request_decided: "Request has already been decided",
      too_many_tickets: "Cannot approve more tickets than were requested",
      show_not_open: "The show is not accepting approvals",
      not_enough_tickets: "Not enough tickets remaining to approve this request",
    };
    const code = Object.keys(known).find((k) => error.message.includes(k));
    if (code) return { ok: false, error: known[code] };
    throw new Error(`approve request: ${error.message}`);
  }
  const row = (data ?? [])[0];
  await runOutboxNow(keysOf(jobs));
  await audit({
    actorId: input.reviewer.id,
    actorRole: input.reviewer.role,
    action: "request.approve",
    entityType: "show_request",
    entityId: input.requestId,
    companyId: input.companyId,
    metadata: { bookingId, ticketCount: row?.tickets ?? ticketCount, holdCents: row?.hold_cents ?? holdCents },
  });
  return { ok: true, bookingId, acceptBy: row?.accept_by ?? new Date().toISOString() };
}

export async function rejectRequest(input: {
  requestId: string;
  reviewer: { id: string; role: string };
  companyId: string;
}) {
  const db = serviceDb();
  const { data: claimed } = await db
    .from("show_requests")
    .update({
      status: "rejected",
      decided_at: new Date().toISOString(),
      decided_by: input.reviewer.id,
    })
    .eq("id", input.requestId)
    .eq("company_id", input.companyId)
    .in("status", ["pending", "waitlisted"])
    .select("id, creator_id, shows(artists(name))")
    .maybeSingle();
  if (!claimed) return { ok: false as const, error: "Request has already been decided" };

  await notify({
    userId: claimed.creator_id,
    type: "request_rejected",
    title: "Request update",
    body: `Your request for ${claimed.shows?.artists?.name ?? "a show"} wasn't selected this time. Keep exploring. New shows are added all the time.`,
    link: "/creator/messages?tab=requests",
  });
  await audit({
    actorId: input.reviewer.id,
    actorRole: input.reviewer.role,
    action: "request.reject",
    entityType: "show_request",
    entityId: input.requestId,
    companyId: input.companyId,
  });
  return { ok: true as const };
}

export async function waitlistRequest(input: {
  requestId: string;
  reviewer: { id: string; role: string };
  companyId: string;
}) {
  const db = serviceDb();
  const { data: claimed } = await db
    .from("show_requests")
    .update({ status: "waitlisted", waitlisted_at: new Date().toISOString() })
    .eq("id", input.requestId)
    .eq("company_id", input.companyId)
    .eq("status", "pending")
    .select("id, creator_id, shows(artists(name))")
    .maybeSingle();
  if (!claimed) return { ok: false as const, error: "Only pending requests can be waitlisted" };

  await notify({
    userId: claimed.creator_id,
    type: "request_waitlisted",
    title: "You're on the waitlist",
    body: `You've been waitlisted for ${claimed.shows?.artists?.name ?? "a show"}. If a spot opens up, the team can approve you from the waitlist.`,
    link: "/creator/messages?tab=requests",
  });
  await audit({
    actorId: input.reviewer.id,
    actorRole: input.reviewer.role,
    action: "request.waitlist",
    entityType: "show_request",
    entityId: input.requestId,
    companyId: input.companyId,
  });
  return { ok: true as const };
}
