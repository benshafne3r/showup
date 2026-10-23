import "server-only";

import type { ServiceClient } from "@/server/db/service";
import { serviceDb } from "@/server/db/service";
import { geocodeVenue } from "@/server/providers/geocode/nominatim";

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
