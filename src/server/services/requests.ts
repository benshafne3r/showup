import "server-only";

import { serviceDb } from "@/server/db/service";
import { audit } from "./audit";
import { deliver, notify, notifyCompany } from "./notifications";
import { agencyForCreator, notifyAgency } from "./agencies";
import { getPlatformSettings } from "./settings";
import { enforceRateLimit } from "./rate-limit";
import { authorizationAmountCents, formatCents } from "@/lib/money";
import { formatShowDateLong } from "@/lib/dates";

/**
 * Request lifecycle: create → (approve | reject | waitlist) → booking.
 * Approval reserves ticket inventory with a guarded arithmetic UPDATE so the
 * opportunity can never oversell, and snapshots the economics onto the
 * booking so later opportunity edits never change agreed terms.
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

  const { data: request, error } = await db
    .from("show_requests")
    .insert({
      opportunity_id: opp.id,
      show_id: opp.show_id,
      company_id: opp.company_id,
      creator_id: input.creatorId,
      ticket_count: input.ticketCount,
      includes_plus_one: input.ticketCount === 2,
      message: input.message,
    })
    .select("id")
    .single();
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
    return { ok: false, error: error.message };
  }

  await db.from("request_tickets").insert(
    Array.from({ length: input.ticketCount }, (_, i) => ({
      request_id: request.id,
      kind: (i === 0 ? "primary" : "plus_one") as "primary" | "plus_one",
    })),
  );

  const artistName = opp.shows!.artists?.name ?? "the artist";
  await db.from("message_threads").insert({
    request_id: request.id,
    creator_id: input.creatorId,
    company_id: opp.company_id,
    subject: `${artistName} · ${opp.shows!.date}`,
  });

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
  await notifyCompany(opp.company_id, {
    type: "request_submitted",
    title: `${creatorName} requested tickets for ${artistName}`,
    body: agency
      ? `${agency.name} requested ${tickets} for ${artistName} for ${creatorName}, one of their creators.`
      : `${creatorName} requested ${tickets} for ${artistName}.`,
    link: `/label/requests/${request.id}`,
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
  });
  // Keep the other side of a managed relationship in the loop.
  if (agency && actor.role === "creator") {
    await notifyAgency(agency.id, {
      type: "request_submitted",
      title: `${creatorName} requested tickets`,
      body: `${tickets} for ${artistName} on ${opp.shows!.date}.`,
      link: "/manager/messages?tab=requests",
    });
  } else if (agency && actor.role === "manager") {
    // deliver(), not notify(): the agency already knows — it made the request.
    await deliver({
      userId: input.creatorId,
      type: "request_submitted",
      title: `${agency.name} requested tickets for you`,
      body: `${tickets} for ${artistName} on ${opp.shows!.date}. If approved, you'll accept the booking and the card hold.`,
      link: "/creator/messages?tab=requests",
    });
  }
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
}): Promise<{ ok: true; bookingId: string } | { ok: false; error: string }> {
  const db = serviceDb();

  const { data: request } = await db
    .from("show_requests")
    .select("id, opportunity_id, show_id, company_id, creator_id, ticket_count, status")
    .eq("id", input.requestId)
    .eq("company_id", input.companyId)
    .single();
  if (!request) return { ok: false, error: "Request not found" };

  const ticketCount = (input.confirmedTicketCount ?? request.ticket_count) as 1 | 2;
  if (ticketCount > request.ticket_count) {
    return { ok: false, error: "Cannot approve more tickets than were requested" };
  }

  const { data: opp } = await db
    .from("show_opportunities")
    .select(
      "id, stated_ticket_value_cents, deposit_percentage, creator_payment_cents, content_deadline_days, tickets_total, tickets_claimed, shows(id, date, status, title, artists(name))",
    )
    .eq("id", request.opportunity_id)
    .single();
  if (!opp) return { ok: false, error: "Opportunity not found" };
  if (opp.shows!.status !== "published") {
    return { ok: false, error: "The show is not accepting approvals" };
  }

  // 1. Claim the request (kills double-approval races).
  const { data: claimed } = await db
    .from("show_requests")
    .update({
      status: "approved",
      decided_at: new Date().toISOString(),
      decided_by: input.reviewer.id,
    })
    .eq("id", request.id)
    .in("status", ["pending", "waitlisted"])
    .select("id")
    .maybeSingle();
  if (!claimed) return { ok: false, error: "Request has already been decided" };

  const revertClaim = () =>
    db
      .from("show_requests")
      .update({ status: "pending", decided_at: null, decided_by: null })
      .eq("id", request.id)
      .eq("status", "approved");

  // 2. Reserve inventory with a guarded arithmetic update (no oversell).
  const { data: reserved, error: reserveError } = await db.rpc("reserve_tickets", {
    p_opportunity_id: request.opportunity_id,
    p_count: ticketCount,
  });
  if (reserveError || !reserved) {
    await revertClaim();
    return { ok: false, error: "Not enough tickets remaining to approve this request" };
  }

  // 3. Snapshot terms → booking.
  const settings = await getPlatformSettings();
  const deadline = new Date(Date.now() + settings.acceptanceWindowHours * 3600 * 1000);
  const holdCents = authorizationAmountCents(
    opp.stated_ticket_value_cents,
    ticketCount,
    opp.deposit_percentage,
  );
  const contentRequired = opp.creator_payment_cents > 0;
  const showDate = new Date(`${opp.shows!.date}T00:00:00`);
  const contentDeadline = new Date(showDate);
  contentDeadline.setDate(contentDeadline.getDate() + opp.content_deadline_days);

  const { data: booking, error: bookingError } = await db
    .from("bookings")
    .insert({
      request_id: request.id,
      opportunity_id: request.opportunity_id,
      show_id: request.show_id,
      company_id: request.company_id,
      creator_id: request.creator_id,
      status: "awaiting_acceptance",
      stated_ticket_value_cents: opp.stated_ticket_value_cents,
      deposit_percentage: opp.deposit_percentage,
      authorization_amount_cents: holdCents,
      creator_payment_cents: opp.creator_payment_cents,
      ticket_count: ticketCount,
      includes_plus_one: ticketCount === 2,
      content_required: contentRequired,
      content_state: contentRequired ? "pending" : "not_required",
      content_deadline_at: contentRequired ? contentDeadline.toISOString() : null,
      acceptance_deadline_at: deadline.toISOString(),
    })
    .select("id")
    .single();
  if (bookingError) {
    await db.rpc("release_tickets", {
      p_opportunity_id: request.opportunity_id,
      p_count: ticketCount,
    });
    await revertClaim();
    return { ok: false, error: bookingError.message };
  }

  await db.from("booking_tickets").insert(
    Array.from({ length: ticketCount }, (_, i) => ({
      booking_id: booking.id,
      kind: (i === 0 ? "primary" : "plus_one") as "primary" | "plus_one",
    })),
  );

  const artistName = opp.shows!.artists?.name ?? "the show";
  await notify({
    userId: request.creator_id,
    type: "request_approved",
    title: `You're approved for ${artistName}!`,
    body: `You have ${settings.acceptanceWindowHours} hours to review the terms and secure your spot. The temporary hold will be ${formatCents(holdCents)} across ${ticketCount} ticket${ticketCount > 1 ? "s" : ""}.`,
    link: `/creator/bookings/${booking.id}`,
  });
  await audit({
    actorId: input.reviewer.id,
    actorRole: input.reviewer.role,
    action: "request.approve",
    entityType: "show_request",
    entityId: request.id,
    companyId: request.company_id,
    metadata: { bookingId: booking.id, ticketCount, holdCents },
  });
  return { ok: true, bookingId: booking.id };
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
