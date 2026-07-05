import "server-only";

import type { EventProvider } from "./types";
import { BandsintownProvider } from "./bandsintown";
import { TicketmasterProvider } from "./ticketmaster";
import { DemoEventProvider } from "./demo";

let cached: EventProvider | null = null;

/**
 * Env-selected tour-date provider:
 * - BANDSINTOWN_APP_ID set → Bandsintown
 * - else TICKETMASTER_API_KEY set → Ticketmaster Discovery
 * - else → offline demo provider (canned events for the demo artists)
 */
export function eventProvider(): EventProvider {
  if (!cached) {
    const bandsintownId = process.env.BANDSINTOWN_APP_ID;
    const ticketmasterKey = process.env.TICKETMASTER_API_KEY;
    cached = bandsintownId
      ? new BandsintownProvider(bandsintownId)
      : ticketmasterKey
        ? new TicketmasterProvider(ticketmasterKey)
        : new DemoEventProvider();
  }
  return cached;
}

export type { ExternalEvent } from "./types";
