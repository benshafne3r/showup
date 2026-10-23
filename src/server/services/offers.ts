import "server-only";

import { serviceDb } from "@/server/db/service";
import { notifyAgency } from "./agencies";
import { getPlatformSettings } from "./settings";
import { runOutboxNow, type OutboxJob } from "@/server/jobs/queue";
import { deliverJob, keysOf } from "@/server/jobs/outbox";
import { randomUUID } from "node:crypto";
import { audit } from "./audit";
import { cityKey } from "@/lib/cities";
import { showStateKey } from "@/lib/us-states";
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

/** Default number of creators shown per group; "load more" raises it. */
export const SUGGESTION_PAGE = 60;

/**
 * How many creators are in / near each venue (for the Creators tab's city
 * list), counted in SQL against the indexed city / state keys.
 */
export async function creatorCountsNear(venues: { city: string; state?: string | null }[]) {
  if (!venues.length) return [];
  const { data, error } = await serviceDb().rpc("creator_counts_near", {
    p_city_keys: venues.map((v) => cityKey(v.city)),
    p_state_keys: venues.map((v) => showStateKey(v)),
  });
  if (error) throw new Error(`count creators: ${error.message}`);
  const byIdx = new Map((data ?? []).map((r) => [r.idx, r]));
  return venues.map((_, i) => ({
    inCity: Number(byIdx.get(i + 1)?.in_city ?? 0),
    nearby: Number(byIdx.get(i + 1)?.nearby ?? 0),
  }));
}

/**
 * Creators for a show: in its city, then elsewhere in its state, biggest
 * audiences first. Queried page by page in SQL (creators_near) with the true
 * totals, so large rosters aren't loaded or capped in memory.
 */
export async function suggestCreatorsForShow(input: {
  companyId: string;
  showId: string;
  limit?: number;
}): Promise<{
  inCity: SuggestedCreator[];
  nearby: SuggestedCreator[];
  inCityTotal: number;
  nearbyTotal: number;
  city: string;
} | null> {
  const db = serviceDb();
  const limit = Math.min(Math.max(input.limit ?? SUGGESTION_PAGE, 1), 600);
  const { data: show } = await db
    .from("shows")
    .select("id, venues(city, state), show_opportunities(id)")
    .eq("id", input.showId)
    .eq("company_id", input.companyId)
    .maybeSingle();
  if (!show?.venues || !show.show_opportunities) return null;

  const ck = cityKey(show.venues.city);
  const sk = showStateKey(show.venues);
  const [cityRes, nearRes] = await Promise.all([
    db.rpc("creators_near", { p_city_key: ck, p_state_key: sk, p_bucket: "city", p_limit: limit, p_offset: 0 }),
    db.rpc("creators_near", { p_city_key: ck, p_state_key: sk, p_bucket: "nearby", p_limit: limit, p_offset: 0 }),
  ]);
  if (cityRes.error || nearRes.error) throw new Error(`creators near: ${(cityRes.error ?? nearRes.error)!.message}`);
  const cityIds = (cityRes.data ?? []).map((r) => r.user_id);
  const nearIds = (nearRes.data ?? []).map((r) => r.user_id);
  const inCityTotal = Number(cityRes.data?.[0]?.total ?? 0);
  const nearbyTotal = Number(nearRes.data?.[0]?.total ?? 0);
  const ids = [...cityIds, ...nearIds];
  if (!ids.length) return { inCity: [], nearby: [], inCityTotal, nearbyTotal, city: show.venues.city };

  const [{ data: profiles }, { data: requests }, { data: rosters }] = await Promise.all([
    db
      .from("creator_profiles")
      .select(
        `user_id, city, region, country, categories, audience_size,
         users!inner(full_name, avatar_url),
         creator_social_accounts(platform, handle, followers)`,
      )
      .in("user_id", ids),
    db
      .from("show_requests")
      .select("creator_id")
      .eq("opportunity_id", show.show_opportunities.id)
      .in("creator_id", ids)
      .in("status", [...ACTIVE_REQUEST]),
    db.from("agency_creators").select("creator_id, agencies(name)").in("creator_id", ids),
  ]);
  const profileBy = new Map((profiles ?? []).map((p) => [p.user_id, p]));
  const taken = new Set((requests ?? []).map((r) => r.creator_id));
  const agencyBy = new Map((rosters ?? []).map((r) => [r.creator_id, r.agencies?.name ?? null]));

  const toCard = (id: string): SuggestedCreator | null => {
    const p = profileBy.get(id);
    if (!p) return null;
    const followers = { tiktok: 0, instagram: 0, youtube: 0 };
    let handle: string | null = null;
    for (const s of p.creator_social_accounts ?? []) {
      if (s.platform === "tiktok" || s.platform === "instagram" || s.platform === "youtube") {
        followers[s.platform] = Math.max(followers[s.platform], s.followers);
      }
      if (s.platform === "tiktok" && s.handle) handle = s.handle;
    }
    return {
      id,
      name: p.users.full_name || "Creator",
      avatarUrl: p.users.avatar_url,
      handle,
      followers,
      tags: p.categories ?? [],
      location: locationLabel(p),
      agencyName: agencyBy.get(id) ?? null,
      taken: taken.has(id),
    };
  };
  const cards = (list: string[]) => list.map(toCard).filter((c): c is SuggestedCreator => c !== null);
  return { inCity: cards(cityIds), nearby: cards(nearIds), inCityTotal, nearbyTotal, city: show.venues.city };
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

/**
 * Bookings waiting on the agency (label invites and approved requests),
 * soonest deadline first. The roster is joined in SQL, so this works for any
 * roster size.
 */
export async function pendingOffersForAgency(agencyId: string, limit = 200) {
  const db = serviceDb();
  const { data: page, error } = await db.rpc("agency_waiting_bookings", {
    p_agency_id: agencyId,
    p_limit: limit,
    p_offset: 0,
  });
  if (error) throw new Error(`waiting bookings: ${error.message}`);
  const ids = (page ?? []).map((r) => r.booking_id);
  if (!ids.length) return [];
  const { data: rows } = await db
    .from("bookings")
    .select(
      `id, authorization_amount_cents, acceptance_deadline_at, ticket_count,
       users:users!creator_id(full_name, avatar_url),
       shows!inner(date, artists(name), venues(city)),
       companies(name),
       show_requests(offered_at)`,
    )
    .in("id", ids);
  const byId = new Map((rows ?? []).map((b) => [b.id, b]));
  const data = ids.map((id) => byId.get(id)).filter((b) => b !== undefined);
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
