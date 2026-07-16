import "server-only";

import { EventProviderError, type EventProvider, type ExternalEvent } from "./types";

/**
 * Ticketmaster Discovery API adapter. Keys are free and issued instantly at
 * https://developer.ticketmaster.com (rate-limited to 5 req/s, 5000/day on
 * the free tier — plenty for show imports).
 */
export class TicketmasterProvider implements EventProvider {
  readonly name = "ticketmaster" as const;

  constructor(private readonly apiKey: string) {}

  async searchEvents(artistName: string): Promise<ExternalEvent[]> {
    const params = new URLSearchParams({
      apikey: this.apiKey,
      keyword: artistName.trim(),
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
        `Ticketmaster returned ${response.status} — check TICKETMASTER_API_KEY`,
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
          date,
          startTime: event.dates?.start?.localTime?.slice(0, 5),
          url: event.url,
        };
      })
      .filter((event): event is ExternalEvent => event !== null);
  }
}
