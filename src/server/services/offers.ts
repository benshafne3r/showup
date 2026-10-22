import "server-only";

import { serviceDb } from "@/server/db/service";
import { approveRequest } from "./requests";
import { deliver } from "./notifications";
import { notifyAgency } from "./agencies";
import { audit } from "./audit";
import { cityKey } from "@/lib/cities";
import { showStateKey, stateKey } from "@/lib/us-states";
import { locationLabel } from "@/lib/roster";
import { formatDateTime, formatShowDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";

/**
 * Label invites ("offers"): on a show page the label sees creators in that
 * city (then elsewhere in the same state) and checks the ones it wants. Each
 * pick becomes an approved request + booking waiting for acceptance. Creators
 * on an agency roster are handled by the agency only (it accepts, and the
 * hold goes on its card); labels never contact those creators directly.
 */

export type SuggestedCreator = {
  id: string;
  name: string;
  avatarUrl: string | null;
  handle: string | null;
  followers: { tiktok: number; instagram: number; youtube: number };
  tags: string[];
  location: string;
  agencyName: string | null;
  /** Already requested / invited / booked for this show. */
  taken: boolean;
};

const MAX_OFFERS_PER_SEND = 25;
const ACTIVE_REQUEST = ["pending", "approved", "waitlisted"] as const;

export async function suggestCreatorsForShow(input: {
  companyId: string;
  showId: string;
}): Promise<{ inCity: SuggestedCreator[]; nearby: SuggestedCreator[]; city: string } | null> {
  const db = serviceDb();
  const { data: show } = await db
    .from("shows")
    .select("id, venues(city, state), show_opportunities(id)")
    .eq("id", input.showId)
    .eq("company_id", input.companyId)
    .maybeSingle();
  if (!show?.venues || !show.show_opportunities) return null;

  const showCity = cityKey(show.venues.city);
  const showState = showStateKey(show.venues);

  const { data: profiles } = await db
    .from("creator_profiles")
    .select(
      `id, user_id, city, region, country, categories, audience_size,
       users!inner(full_name, avatar_url, status, role),
       creator_social_accounts(platform, handle, followers)`,
    )
    .not("onboarded_at", "is", null)
    .eq("users.status", "active")
    .eq("users.role", "creator")
    .limit(5000);

  const matches = (profiles ?? []).filter((p) => {
    if (p.city && cityKey(p.city) === showCity) return true;
    return !!showState && stateKey(p.region) === showState;
  });
  if (!matches.length) return { inCity: [], nearby: [], city: show.venues.city };

  const ids = matches.map((p) => p.user_id);
  const [{ data: requests }, { data: rosters }] = await Promise.all([
    db
      .from("show_requests")
      .select("creator_id")
      .eq("opportunity_id", show.show_opportunities.id)
      .in("creator_id", ids)
      .in("status", [...ACTIVE_REQUEST]),
    db.from("agency_creators").select("creator_id, agencies(name)").in("creator_id", ids),
  ]);
  const taken = new Set((requests ?? []).map((r) => r.creator_id));
  const agencyBy = new Map((rosters ?? []).map((r) => [r.creator_id, r.agencies?.name ?? null]));

  const toCard = (p: (typeof matches)[number]): SuggestedCreator => {
    const followers = { tiktok: 0, instagram: 0, youtube: 0 };
    let handle: string | null = null;
    for (const s of p.creator_social_accounts ?? []) {
      if (s.platform === "tiktok" || s.platform === "instagram" || s.platform === "youtube") {
        followers[s.platform] = Math.max(followers[s.platform], s.followers);
      }
      if (s.platform === "tiktok" && s.handle) handle = s.handle;
    }
    return {
      id: p.user_id,
      name: p.users.full_name || "Creator",
      avatarUrl: p.users.avatar_url,
      handle,
      followers,
      tags: p.categories ?? [],
      location: locationLabel(p),
      agencyName: agencyBy.get(p.user_id) ?? null,
      taken: taken.has(p.user_id),
    };
  };
  const byAudience = (a: (typeof matches)[number], b: (typeof matches)[number]) => b.audience_size - a.audience_size;
  const inCity = matches.filter((p) => p.city && cityKey(p.city) === showCity).sort(byAudience);
  const nearby = matches.filter((p) => !(p.city && cityKey(p.city) === showCity)).sort(byAudience);
  return { inCity: inCity.map(toCard), nearby: nearby.map(toCard), city: show.venues.city };
}

export async function sendOffers(input: {
  companyId: string;
  showId: string;
  creatorIds: string[];
  reviewer: { id: string; role: string };
}): Promise<{ ok: true; sent: number; skipped: string[] } | { ok: false; error: string }> {
  const creatorIds = [...new Set(input.creatorIds)];
  if (!creatorIds.length) return { ok: false, error: "Pick at least one creator" };
  if (creatorIds.length > MAX_OFFERS_PER_SEND) {
    return { ok: false, error: `Pick up to ${MAX_OFFERS_PER_SEND} creators at a time` };
  }
  const db = serviceDb();

  const { data: show } = await db
    .from("shows")
    .select("id, date, status, artists(name), venues(city), companies(name), show_opportunities(id, tickets_total, tickets_claimed)")
    .eq("id", input.showId)
    .eq("company_id", input.companyId)
    .maybeSingle();
  const opp = show?.show_opportunities;
  if (!show || !opp) return { ok: false, error: "Show not found" };
  if (show.status !== "published") return { ok: false, error: "Publish the show before inviting creators" };
  if (show.date < new Date().toISOString().slice(0, 10)) return { ok: false, error: "This show has already happened" };
  const left = opp.tickets_total - opp.tickets_claimed;
  if (creatorIds.length > left) {
    return { ok: false, error: `Only ${left} ticket${left === 1 ? "" : "s"} left for this show` };
  }

  const { data: creators } = await db
    .from("users")
    .select("id, full_name, role, status, creator_profiles!inner(onboarded_at)")
    .in("id", creatorIds)
    .eq("role", "creator")
    .eq("status", "active");
  const eligible = new Map((creators ?? []).filter((c) => c.creator_profiles?.onboarded_at).map((c) => [c.id, c]));

  const artist = show.artists?.name ?? "a show";
  const label = show.companies?.name ?? "A label";
  const sent: { creatorId: string; name: string; bookingId: string; acceptBy: string }[] = [];
  const skipped: string[] = [];

  for (const creatorId of creatorIds) {
    const creator = eligible.get(creatorId);
    if (!creator) {
      skipped.push("A creator who isn't available");
      continue;
    }
    const { data: request, error } = await db
      .from("show_requests")
      .insert({
        opportunity_id: opp.id,
        show_id: show.id,
        company_id: input.companyId,
        creator_id: creatorId,
        status: "pending",
        ticket_count: 1,
        includes_plus_one: false,
        message: `Invited by ${label}`,
        offered_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !request) {
      // Unique index: they already have a live request for this show.
      skipped.push(`${creator.full_name || "A creator"} (already requested)`);
      continue;
    }
    const approved = await approveRequest({
      requestId: request.id,
      reviewer: input.reviewer,
      companyId: input.companyId,
      quiet: true,
    });
    if (!approved.ok) {
      await db.from("show_requests").delete().eq("id", request.id).eq("status", "pending");
      skipped.push(`${creator.full_name || "A creator"} (${approved.error})`);
      continue;
    }
    sent.push({ creatorId, name: creator.full_name || "Creator", bookingId: approved.bookingId, acceptBy: approved.acceptBy });
  }

  // Tell whoever acts for each creator: their agency, or the creator themself.
  const { data: rosters } = sent.length
    ? await db.from("agency_creators").select("creator_id, agency_id").in("creator_id", sent.map((s) => s.creatorId))
    : { data: [] };
  const agencyOf = new Map((rosters ?? []).map((r) => [r.creator_id, r.agency_id]));
  const byAgency = new Map<string, typeof sent>();
  for (const offer of sent) {
    const agencyId = agencyOf.get(offer.creatorId);
    if (agencyId) {
      byAgency.set(agencyId, [...(byAgency.get(agencyId) ?? []), offer]);
    } else {
      await deliver({
        userId: offer.creatorId,
        type: "offer_received",
        title: `${label} invited you to ${artist}`,
        body: `You're invited to ${artist} on ${formatShowDate(show.date)}. Accept by ${formatDateTime(offer.acceptBy)} to lock in your ticket.`,
        link: `/creator/bookings/${offer.bookingId}`,
      });
    }
  }
  for (const [agencyId, offers] of byAgency) {
    const single = offers.length === 1 ? offers[0] : null;
    await notifyAgency(agencyId, {
      type: "offer_received",
      title: single
        ? `${label} invited ${single.name} to ${artist}`
        : `${label} invited ${offers.length} of your creators to ${artist}`,
      body: `${artist}, ${formatShowDate(show.date)}${show.venues?.city ? ` in ${show.venues.city}` : ""}. Accept or pass for each by ${formatDateTime(offers[0].acceptBy)}. Holds go on your card.`,
      link: single ? `/manager/bookings/${single.bookingId}` : "/manager",
      email: {
        details: offers.map((o) => ({ label: o.name, value: "Invited" })),
        ctaLabel: "Review invites",
      },
    });
  }

  await audit({
    actorId: input.reviewer.id,
    actorRole: input.reviewer.role,
    action: "show.offers_sent",
    entityType: "show",
    entityId: show.id,
    companyId: input.companyId,
    metadata: { sent: sent.length, skipped: skipped.length },
  });
  return { ok: true, sent: sent.length, skipped };
}

/** Bookings waiting on the agency: label invites and approved requests. */
export async function pendingOffersForAgency(agencyId: string) {
  const db = serviceDb();
  const { data: roster } = await db.from("agency_creators").select("creator_id").eq("agency_id", agencyId);
  const ids = (roster ?? []).map((r) => r.creator_id);
  if (!ids.length) return [];
  const { data } = await db
    .from("bookings")
    .select(
      `id, authorization_amount_cents, acceptance_deadline_at, ticket_count,
       users:users!creator_id(full_name, avatar_url),
       shows!inner(date, artists(name), venues(city)),
       companies(name),
       show_requests(offered_at)`,
    )
    .in("creator_id", ids)
    .in("status", ["awaiting_acceptance", "awaiting_payment_method"])
    .gt("acceptance_deadline_at", new Date().toISOString())
    .order("acceptance_deadline_at", { ascending: true })
    .limit(100);
  return (data ?? []).map((b) => ({
    bookingId: b.id,
    creatorName: b.users?.full_name || "Creator",
    avatarUrl: b.users?.avatar_url ?? null,
    artist: b.shows.artists?.name ?? "Show",
    date: b.shows.date,
    city: b.shows.venues?.city ?? "",
    label: b.companies?.name ?? "A label",
    hold: formatCents(b.authorization_amount_cents),
    acceptBy: b.acceptance_deadline_at,
    invited: !!b.show_requests?.offered_at,
  }));
}
