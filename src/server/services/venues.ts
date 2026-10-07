import "server-only";

import type { ServiceClient } from "@/server/db/service";
import { serviceDb } from "@/server/db/service";
import { geocodeVenue } from "@/server/providers/geocode/nominatim";
import { log, errorFields } from "@/server/log";

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
 * Scheduled step: geocode venues that have no coordinates yet (new venues
 * first; failed lookups retry after a week). Paced for Nominatim's 1 req/s.
 */
export async function geocodePendingVenues(db: ServiceClient): Promise<{ located: number; missed: number }> {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: venues } = await db
    .from("venues")
    .select("id, name, address, city, state, country")
    .is("latitude", null)
    .or(`geocoded_at.is.null,geocoded_at.lt.${weekAgo}`)
    .order("geocoded_at", { ascending: true, nullsFirst: true })
    .limit(8);
  let located = 0;
  let missed = 0;
  for (const venue of venues ?? []) {
    try {
      if (await geocodeAndStore(venue, db)) located++;
      else missed++;
    } catch (err) {
      missed++;
      log.warn("Venue geocoding failed", { venueId: venue.id, ...errorFields(err) });
    }
    await new Promise((r) => setTimeout(r, 1100));
  }
  return { located, missed };
}
