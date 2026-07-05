import "server-only";

import { EventProviderError, type EventProvider, type ExternalEvent } from "./types";

/**
 * Bandsintown Events API adapter. Requires an approved app_id — Bandsintown
 * grants these free of charge to registered apps (https://artists.bandsintown.com
 * → API). Anonymous app_ids are rejected with a 403 policy error.
 */
export class BandsintownProvider implements EventProvider {
  readonly name = "bandsintown" as const;

  constructor(private readonly appId: string) {}

  async searchEvents(artistName: string): Promise<ExternalEvent[]> {
    const artist = encodeURIComponent(artistName.trim());
    const url = `https://rest.bandsintown.com/artists/${artist}/events?app_id=${encodeURIComponent(this.appId)}&date=upcoming`;
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      next: { revalidate: 300 },
    });
    if (!response.ok) {
      throw new EventProviderError(
        `Bandsintown returned ${response.status} — check that BANDSINTOWN_APP_ID is an approved app id`,
        this.name,
      );
    }
    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) {
      // Bandsintown returns {warn|Message} objects for unknown artists / bad ids.
      return [];
    }

    return payload
      .map((event): ExternalEvent | null => {
        const e = event as {
          datetime?: string;
          url?: string;
          venue?: { name?: string; city?: string; region?: string; country?: string };
        };
        if (!e.datetime || !e.venue?.name || !e.venue.city) return null;
        return {
          artistName,
          venueName: e.venue.name,
          city: e.venue.city,
          region: e.venue.region ?? "",
          country: e.venue.country ?? "",
          date: e.datetime.slice(0, 10),
          startTime: e.datetime.length >= 16 ? e.datetime.slice(11, 16) : undefined,
          url: e.url,
        };
      })
      .filter((event): event is ExternalEvent => event !== null)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }
}
