import "server-only";

import type { EventProvider, ExternalEvent } from "./types";

/**
 * Offline demo provider — active when no Bandsintown / Ticketmaster key is
 * configured, so the import flow is fully demoable. The canned data mirrors
 * the two demo artists' real announced 2026 tours.
 */
const DEMO_EVENTS: Record<string, Omit<ExternalEvent, "artistName">[]> = {
  "baby keem": [
    { venueName: "All Points East (Victoria Park)", city: "London", region: "", country: "GB", date: "2026-08-29", startTime: "17:00" },
    { venueName: "Palladium", city: "Cologne", region: "", country: "DE", date: "2026-08-31", startTime: "20:30" },
    { venueName: "Tempodrom", city: "Berlin", region: "", country: "DE", date: "2026-09-01", startTime: "20:30" },
    { venueName: "L'Olympia", city: "Paris", region: "", country: "FR", date: "2026-09-03", startTime: "20:30" },
    { venueName: "Halle 622", city: "Zurich", region: "", country: "CH", date: "2026-09-06", startTime: "20:30" },
    { venueName: "AFAS Live", city: "Amsterdam", region: "", country: "NL", date: "2026-09-08", startTime: "20:30" },
    { venueName: "O2 Victoria Warehouse", city: "Manchester", region: "", country: "GB", date: "2026-09-11", startTime: "19:00" },
    { venueName: "O2 Academy Glasgow", city: "Glasgow", region: "", country: "GB", date: "2026-09-14", startTime: "19:00" },
    { venueName: "O2 Academy Birmingham", city: "Birmingham", region: "", country: "GB", date: "2026-09-16", startTime: "19:00" },
    { venueName: "O2 Academy Brixton", city: "London", region: "", country: "GB", date: "2026-09-18", startTime: "19:00" },
  ],
  "ella langley": [
    { venueName: "TD Coliseum", city: "Hamilton", region: "ON", country: "CA", date: "2026-07-16" },
    { venueName: "M&T Bank Stadium", city: "Baltimore", region: "MD", country: "US", date: "2026-07-18" },
    { venueName: "Appalachian Wireless Arena", city: "Pikeville", region: "KY", country: "US", date: "2026-07-23" },
    { venueName: "Koka Booth Amphitheatre", city: "Cary", region: "NC", country: "US", date: "2026-07-24" },
    { venueName: "North Charleston Coliseum", city: "North Charleston", region: "SC", country: "US", date: "2026-07-25" },
    { venueName: "BankNH Pavilion", city: "Gilford", region: "NH", country: "US", date: "2026-07-30" },
    { venueName: "CMAC", city: "Canandaigua", region: "NY", country: "US", date: "2026-07-31" },
    { venueName: "Lincoln Financial Field", city: "Philadelphia", region: "PA", country: "US", date: "2026-08-01" },
    { venueName: "Moody Center", city: "Austin", region: "TX", country: "US", date: "2026-08-13" },
    { venueName: "Dickies Arena", city: "Fort Worth", region: "TX", country: "US", date: "2026-08-15" },
    { venueName: "Resch Center", city: "Green Bay", region: "WI", country: "US", date: "2026-08-20" },
    { venueName: "Illinois State Fairgrounds", city: "Springfield", region: "IL", country: "US", date: "2026-08-21" },
    { venueName: "Prudential Center", city: "Newark", region: "NJ", country: "US", date: "2026-09-10" },
    { venueName: "Red Rocks Amphitheatre", city: "Morrison", region: "CO", country: "US", date: "2026-10-07" },
    { venueName: "The Greek Theatre", city: "Los Angeles", region: "CA", country: "US", date: "2026-10-13" },
    { venueName: "The Greek Theatre", city: "Los Angeles", region: "CA", country: "US", date: "2026-10-14" },
    { venueName: "Grand Casino Arena", city: "Saint Paul", region: "MN", country: "US", date: "2026-10-31" },
  ],
};

export class DemoEventProvider implements EventProvider {
  readonly name = "demo" as const;

  async searchEvents(artistName: string): Promise<ExternalEvent[]> {
    const events = DEMO_EVENTS[artistName.trim().toLowerCase()] ?? [];
    const today = new Date().toISOString().slice(0, 10);
    return events
      .filter((event) => event.date >= today)
      .map((event) => ({ ...event, artistName }));
  }
}
