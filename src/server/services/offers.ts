import "server-only";

import { serviceDb } from "@/server/db/service";
import { notifyAgency } from "./agencies";
import { getPlatformSettings } from "./settings";
import { runOutboxNow, type OutboxJob } from "@/server/jobs/queue";
import { deliverJob, keysOf } from "@/server/jobs/outbox";
import { randomUUID } from "node:crypto";
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

/** Every creator who can be invited (finished profile, active). */
async function loadCreatorPool() {
  const { data } = await serviceDb()
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
  return data ?? [];
}
type PoolProfile = Awaited<ReturnType<typeof loadCreatorPool>>[number];

/** Creators in a venue's city, then elsewhere in its state; biggest audiences first. */
function nearVenue(pool: PoolProfile[], venue: { city: string; state?: string | null }) {
  const showCity = cityKey(venue.city);
  const showState = showStateKey(venue);
  const inCity: PoolProfile[] = [];
  const nearby: PoolProfile[] = [];
  for (const p of pool) {
    if (p.city && cityKey(p.city) === showCity) inCity.push(p);
    else if (showState && stateKey(p.region) === showState) nearby.push(p);
  }
  const byAudience = (a: PoolProfile, b: PoolProfile) => b.audience_size - a.audience_size;
  return { inCity: inCity.sort(byAudience), nearby: nearby.sort(byAudience) };
}

/** How many creators are in / near each venue (for the Creators tab's city list). */
export async function creatorCountsNear(venues: { city: string; state?: string | null }[]) {
  const pool = await loadCreatorPool();
  return venues.map((v) => {
    const { inCity, nearby } = nearVenue(pool, v);
    return { inCity: inCity.length, nearby: nearby.length };
  });
}

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

  const near = nearVenue(await loadCreatorPool(), show.venues);
  const matches = [...near.inCity, ...near.nearby];
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

  const toCard = (p: PoolProfile): SuggestedCreator => {
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
  return { inCity: near.inCity.map(toCard), nearby: near.nearby.map(toCard), city: show.venues.city };
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
    .select("id, date, status, artists(name), companies(name), show_opportunities(id, tickets_total, tickets_claimed)")
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

  const [{ data: creators }, { data: rosters }] = await Promise.all([
    db
      .from("users")
      .select("id, full_name, role, status, creator_profiles!inner(onboarded_at)")
      .in("id", creatorIds)
      .eq("role", "creator")
      .eq("status", "active"),
    db.from("agency_creators").select("creator_id, agency_id").in("creator_id", creatorIds),
  ]);
  const eligible = new Map((creators ?? []).filter((c) => c.creator_profiles?.onboarded_at).map((c) => [c.id, c]));
  const agencyOf = new Map((rosters ?? []).map((r) => [r.creator_id, r.agency_id]));

  const artist = show.artists?.name ?? "a show";
  const label = show.companies?.name ?? "A label";
  const settings = await getPlatformSettings();
  // One summary email per agency per batch: every invite in this batch writes
  // the same digest job (same key), so it's created once, atomically with the
  // first invite, and lists whatever invites the batch produced.
  const batchStartedAt = new Date().toISOString();
  const batch = randomUUID();
  const allKeys = new Set<string>();
  let sent = 0;
  const skipped: string[] = [];

  for (const creatorId of creatorIds) {
    const creator = eligible.get(creatorId);
    if (!creator) {
      skipped.push("A creator who isn't available");
      continue;
    }
    const requestId = randomUUID();
    const bookingId = randomUUID();
    const agencyId = agencyOf.get(creatorId);
    const jobs: OutboxJob[] = agencyId
      ? [
          {
            kind: "offer_digest",
            payload: { agencyId, showId: show.id, companyId: input.companyId, since: batchStartedAt },
            dedupe_key: `offers:${batch}:${agencyId}`,
            priority: 3,
            company_id: input.companyId,
          },
        ]
      : [
          deliverJob(`booking:${bookingId}:offered`, {
            userId: creatorId,
            type: "offer_received",
            title: `${label} invited you to ${artist}`,
            body: `You're invited to ${artist} on ${formatShowDate(show.date)}. Accept within ${settings.acceptanceWindowHours} hours to lock in your ticket.`,
            link: `/creator/bookings/${bookingId}`,
          }, input.companyId),
        ];
    const { error } = await db.rpc("offer_request_tx", {
      p_request_id: requestId,
      p_booking_id: bookingId,
      p_opportunity_id: opp.id,
      p_creator_id: creatorId,
      p_company_id: input.companyId,
      p_reviewer: input.reviewer.id,
      p_message: `Invited by ${label}`,
      p_accept_hours: settings.acceptanceWindowHours,
      p_jobs: jobs as never,
    });
    if (error) {
      const name = creator.full_name || "A creator";
      if (error.code === "23505") skipped.push(`${name} (already requested)`);
      else if (error.message.includes("not_enough_tickets")) skipped.push(`${name} (no tickets left)`);
      else if (error.message.includes("show_not_open")) skipped.push(`${name} (show not open)`);
      else throw new Error(`offer: ${error.message}`);
      continue;
    }
    sent++;
    for (const k of keysOf(jobs)) allKeys.add(k);
  }

  await runOutboxNow([...allKeys]);
  await audit({
    actorId: input.reviewer.id,
    actorRole: input.reviewer.role,
    action: "show.offers_sent",
    entityType: "show",
    entityId: show.id,
    companyId: input.companyId,
    metadata: { sent, skipped: skipped.length },
  });
  return { ok: true, sent, skipped };
}

/**
 * Job: one summary to an agency for a batch of label invites, listing the
 * invites for its creators on that show since the batch started.
 */
export async function sendOfferDigest(p: { agencyId: string; showId: string; companyId: string; since: string }) {
  const db = serviceDb();
  const { data: roster } = await db.from("agency_creators").select("creator_id").eq("agency_id", p.agencyId);
  const ids = (roster ?? []).map((r) => r.creator_id);
  if (!ids.length) return;
  const { data: offers, error } = await db
    .from("bookings")
    .select(
      "id, acceptance_deadline_at, users:users!creator_id(full_name), show_requests!inner(offered_at), shows!inner(date, artists(name), venues(city)), companies(name)",
    )
    .eq("show_id", p.showId)
    .in("creator_id", ids)
    .gte("show_requests.offered_at", p.since)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`load offers for digest: ${error.message}`);
  if (!offers?.length) return;

  const first = offers[0];
  const label = first.companies?.name ?? "A label";
  const artist = first.shows.artists?.name ?? "a show";
  const single = offers.length === 1 ? offers[0] : null;
  const name = (o: (typeof offers)[number]) => o.users?.full_name || "Creator";
  await notifyAgency(p.agencyId, {
    type: "offer_received",
    title: single ? `${label} invited ${name(single)} to ${artist}` : `${label} invited ${offers.length} of your creators to ${artist}`,
    body: `${artist}, ${formatShowDate(first.shows.date)}${first.shows.venues?.city ? ` in ${first.shows.venues.city}` : ""}. Accept or pass for each by ${formatDateTime(first.acceptance_deadline_at)}. Holds go on your card.`,
    link: single ? `/manager/bookings/${single.id}` : "/manager",
    email: { details: offers.map((o) => ({ label: name(o), value: "Invited" })), ctaLabel: "Review invites" },
    dedupeKey: `offers:${p.agencyId}:${p.showId}:${p.since}`,
    strict: true,
  });
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
