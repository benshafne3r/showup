import "server-only";

import type { ServiceClient } from "@/server/db/service";
import { serviceDb } from "@/server/db/service";
import { geocodeVenue } from "@/server/providers/geocode/nominatim";
import { searchExternalVenues } from "@/server/providers/events";
import type { VenueSuggestion } from "@/lib/places";
import { withinRateLimit } from "./rate-limit";

type VenueRow = {
  id: string;
  name: string;
  address: string | null;
  city: string;
  state: string | null;
  country: string | null;
};

/** Look up and store one venue's coordinates. Records the attempt either way. */
export async function geocodeAndStore(venue: VenueRow, db: ServiceClient = serviceDb()) {
  const point = await geocodeVenue(venue);
  await db
    .from("venues")
    .update(
      point
        ? { latitude: point.lat, longitude: point.lng, geocoded_at: new Date().toISOString(), geocode_source: "nominatim" }
        : { geocoded_at: new Date().toISOString() },
    )
    .eq("id", venue.id);
  return point;
}

/**
 * Job: geocode one venue that has no coordinates yet (the scheduler enqueues
 * new venues first; failed lookups retry after a week).
 */
export async function geocodeVenueById(venueId: string): Promise<boolean> {
  const db = serviceDb();
  const { data: venue, error } = await db
    .from("venues")
    .select("id, name, address, city, state, country, latitude")
    .eq("id", venueId)
    .maybeSingle();
  if (error) throw new Error(`load venue: ${error.message}`);
  if (!venue || venue.latitude != null) return false;
  return (await geocodeAndStore(venue, db)) !== null;
}

export type VenueDetails = { name: string; address: string | null; state: string | null };

/**
 * Venue name, address and state for shows, as this creator may see them: a
 * secret-location show stays hidden (null) until their request is approved.
 * Server-side on purpose: users' own API access can only read venue cities.
 */
export async function venueDetailsForCreator(
  creatorId: string,
  showIds: string[],
): Promise<Map<string, VenueDetails | null>> {
  const details = new Map<string, VenueDetails | null>();
  if (!showIds.length) return details;
  const db = serviceDb();
  const { data: shows, error } = await db
    .from("shows")
    .select("id, hide_venue_until_approved, venues(name, address, state)")
    .in("id", [...new Set(showIds)]);
  if (error) throw new Error(`Could not load venues: ${error.message}`);

  const hidden = (shows ?? []).filter((s) => s.hide_venue_until_approved).map((s) => s.id);
  const { data: approved } = hidden.length
    ? await db.from("show_requests").select("show_id").eq("creator_id", creatorId).eq("status", "approved").in("show_id", hidden)
    : { data: [] as { show_id: string }[] };
  const approvedFor = new Set((approved ?? []).map((r) => r.show_id));

  for (const show of shows ?? []) {
    const visible = !show.hide_venue_until_approved || approvedFor.has(show.id);
    details.set(
      show.id,
      visible
        ? { name: show.venues?.name ?? "", address: show.venues?.address ?? null, state: show.venues?.state ?? null }
        : null,
    );
  }
  return details;
}

/**
 * Venue type-ahead: this label's own venues first, then Ticketmaster's (US).
 * Other labels' venues never show, so a secret pop-up's address stays theirs.
 */
export async function searchVenues(companyId: string, query: string): Promise<VenueSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const [{ data: own }, external] = await Promise.all([
    serviceDb()
      .from("venues")
      .select("name, city, state, address")
      .eq("created_by_company", companyId)
      .ilike("name", pattern)
      .order("name")
      .limit(5),
    withinRateLimit("ticketmaster.daily", "all").then((ok) => (ok ? searchExternalVenues(q) : [])),
  ]);
  const seen = new Set<string>();
  return [
    ...(own ?? []).map((v) => ({ name: v.name, city: v.city, state: v.state ?? "", address: v.address ?? "" })),
    ...external,
  ].filter((v) => {
    const key = `${v.name}|${v.city}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
