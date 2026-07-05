import "server-only";

/**
 * External event (tour-date) providers. Used by the label app to pull an
 * artist's announced shows and prefill the show form instead of typing
 * venue/city/date by hand.
 */

export type ExternalEvent = {
  artistName: string;
  venueName: string;
  city: string;
  /** State / province / country subdivision, e.g. "CA", "ON". */
  region: string;
  /** ISO country code or name, e.g. "US", "United Kingdom". */
  country: string;
  /** Show date, YYYY-MM-DD (venue-local). */
  date: string;
  /** Start time HH:MM (24h), when the source provides one. */
  startTime?: string;
  /** Link back to the source listing. */
  url?: string;
};

export interface EventProvider {
  readonly name: "bandsintown" | "ticketmaster" | "demo";
  /** Upcoming events for an artist, soonest first. Empty array = none found. */
  searchEvents(artistName: string): Promise<ExternalEvent[]>;
}

export class EventProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
  ) {
    super(message);
    this.name = "EventProviderError";
  }
}
