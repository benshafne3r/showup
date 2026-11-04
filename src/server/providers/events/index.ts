import "server-only";

import { serverEnv } from "@/lib/env";
import type { VenueSuggestion } from "@/lib/places";
import type { EventProvider } from "./types";
import { BandsintownProvider } from "./bandsintown";
import { searchTicketmasterVenues, TicketmasterProvider } from "./ticketmaster";
import { DemoEventProvider } from "./demo";

let cached: EventProvider | null = null;

/**
 * Env-selected tour-date provider:
 * - BANDSINTOWN_APP_ID set → Bandsintown
 * - else TICKETMASTER_API_KEY set → Ticketmaster Discovery
 * - else → offline demo provider (canned events for the demo artists),
 *   also used whenever EXTERNAL_LOOKUPS=fake (tests)
 */
export function eventProvider(): EventProvider {
  if (!cached) {
    const bandsintownId = process.env.BANDSINTOWN_APP_ID;
    const ticketmasterKey = process.env.TICKETMASTER_API_KEY;
    cached =
      serverEnv.externalLookups === "fake"
        ? new DemoEventProvider()
        : bandsintownId
          ? new BandsintownProvider(bandsintownId)
          : ticketmasterKey
            ? new TicketmasterProvider(ticketmasterKey)
            : new DemoEventProvider();
  }
  return cached;
}

/** Ticketmaster venues for the venue type-ahead ([] without a key, in tests, or on error). */
export async function searchExternalVenues(query: string): Promise<VenueSuggestion[]> {
  const key = process.env.TICKETMASTER_API_KEY;
  if (!key || serverEnv.externalLookups === "fake") return [];
  return searchTicketmasterVenues(key, query).catch(() => []);
}

export type { ExternalEvent } from "./types";
