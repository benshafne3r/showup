import "server-only";

import type { VenueSuggestion } from "@/lib/places";
import { EventProviderError, type EventProvider, type ExternalEvent } from "./types";

/**
 * Ticketmaster Discovery API adapter. Keys are free and issued instantly at
 * https://developer.ticketmaster.com (rate-limited to 5 req/s, 5000/day on
 * the free tier — plenty for show imports).
 */
export class TicketmasterProvider implements EventProvider {
  readonly name = "ticketmaster" as const;

  constructor(private readonly apiKey: string) {}

  async searchEvents(artistName: string, spotifyUrl?: string): Promise<ExternalEvent[]> {
    // The exact artist when Ticketmaster lists their Spotify link; otherwise a
    // name search (filtered by attraction name below).
    const attractionId = spotifyUrl ? await this.attractionForSpotify(artistName, spotifyUrl) : null;
    const params = new URLSearchParams({
      apikey: this.apiKey,
      ...(attractionId ? { attractionId } : { keyword: artistName.trim() }),
      classificationName: "music",
      sort: "date,asc",
      size: "50",
    });
    const response = await fetch(
      `https://app.ticketmaster.com/discovery/v2/events.json?${params}`,
      { headers: { accept: "application/json" }, next: { revalidate: 300 } },
    );
    if (!response.ok) {
      throw new EventProviderError(
        `Ticketmaster returned ${response.status}. Check TICKETMASTER_API_KEY`,
        this.name,
      );
    }
    const payload = (await response.json()) as {
      _embedded?: {
        events?: Array<{
          url?: string;
          dates?: { start?: { localDate?: string; localTime?: string } };
          _embedded?: {
            venues?: Array<{
              name?: string;
              city?: { name?: string };
              state?: { stateCode?: string };
              country?: { countryCode?: string };
              address?: { line1?: string };
            }>;
            attractions?: Array<{ name?: string }>;
          };
        }>;
      };
    };

    const wanted = artistName.trim().toLowerCase();
    const seen = new Set<string>();
    return (payload._embedded?.events ?? [])
      .map((event): ExternalEvent | null => {
        const venue = event._embedded?.venues?.[0];
        const date = event.dates?.start?.localDate;
        if (!venue?.name || !venue.city?.name || !date) return null;

        // Keyword search is fuzzy (tribute acts, festivals, unrelated bills).
        // If the event lists attractions, keep it only when one matches the
        // artist we asked for; events with no attractions pass through.
        const attractions = event._embedded?.attractions ?? [];
        if (attractions.length > 0) {
          const match = attractions.some((a) => {
            const name = a.name?.trim().toLowerCase();
            return !!name && (name === wanted || name.includes(wanted) || wanted.includes(name));
          });
          if (!match) return null;
        }

        // Collapse duplicate listings for the same show (multiple ticket types).
        const key = `${date}|${venue.name.toLowerCase()}|${venue.city.name.toLowerCase()}`;
        if (seen.has(key)) return null;
        seen.add(key);

        return {
          artistName: wanted,
          venueName: venue.name,
          city: venue.city.name,
          region: venue.state?.stateCode ?? "",
          country: venue.country?.countryCode ?? "",
          address: venue.address?.line1 || undefined,
          date,
          startTime: event.dates?.start?.localTime?.slice(0, 5),
          url: event.url,
        };
      })
      .filter((event): event is ExternalEvent => event !== null);
  }

  /** Ticketmaster's id for the artist whose page links this Spotify artist, if any. */
  private async attractionForSpotify(artistName: string, spotifyUrl: string): Promise<string | null> {
    const spotifyId = spotifyUrl.match(/artist\/([A-Za-z0-9]+)/)?.[1];
    if (!spotifyId) return null;
    const params = new URLSearchParams({
      apikey: this.apiKey,
      keyword: artistName.trim(),
      classificationName: "music",
      size: "20",
    });
    const response = await fetch(`https://app.ticketmaster.com/discovery/v2/attractions.json?${params}`, {
      headers: { accept: "application/json" },
      next: { revalidate: 3600 },
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      _embedded?: { attractions?: Array<{ id?: string; externalLinks?: { spotify?: Array<{ url?: string }> } }> };
    };
    const match = (payload._embedded?.attractions ?? []).find((a) =>
      a.externalLinks?.spotify?.some((link) => link.url?.includes(`/artist/${spotifyId}`)),
    );
    return match?.id ?? null;
  }
}

/** Ticketmaster venues (US) matching a name, for the venue type-ahead. */
export async function searchTicketmasterVenues(apiKey: string, query: string, limit = 5): Promise<VenueSuggestion[]> {
  const params = new URLSearchParams({ apikey: apiKey, keyword: query.trim(), countryCode: "US", size: String(limit) });
  const response = await fetch(`https://app.ticketmaster.com/discovery/v2/venues.json?${params}`, {
    headers: { accept: "application/json" },
    next: { revalidate: 3600 },
  });
  if (!response.ok) throw new EventProviderError(`Ticketmaster returned ${response.status}`, "ticketmaster");
  const payload = (await response.json()) as {
    _embedded?: {
      venues?: Array<{ name?: string; city?: { name?: string }; state?: { stateCode?: string }; address?: { line1?: string } }>;
    };
  };
  return (payload._embedded?.venues ?? []).flatMap((v) =>
    v.name && v.city?.name
      ? [{ name: v.name, city: v.city.name, state: v.state?.stateCode ?? "", address: v.address?.line1 ?? "" }]
      : [],
  );
}
