import "server-only";

import { serverEnv } from "@/lib/env";
import { BRAND } from "@/lib/brand";

/**
 * Venue → coordinates via OpenStreetMap Nominatim (free; usage policy: a real
 * User-Agent and at most ~1 request/second, which the caller enforces).
 * Tries the street address first, then the venue name, both scoped to the city.
 */
export async function geocodeVenue(venue: {
  name: string;
  address: string | null;
  city: string;
  state: string | null;
  country: string | null;
}): Promise<{ lat: number; lng: number } | null> {
  if (serverEnv.geocoder !== "nominatim") return null;
  const place = [venue.city, venue.state, venue.country].filter(Boolean).join(", ");
  const queries = [
    venue.address ? `${venue.address}, ${place}` : null,
    `${venue.name}, ${place}`,
  ].filter(Boolean) as string[];

  for (const q of queries) {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": `${BRAND.name}/1.0 (${BRAND.supportEmail})`, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const hits = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (hits[0]) return { lat: Number(hits[0].lat), lng: Number(hits[0].lon) };
    await new Promise((r) => setTimeout(r, 1100));
  }
  return null;
}
