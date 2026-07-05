"use server";

import { z } from "zod";
import { requireLabelWithCompany, AuthError } from "@/server/auth/guards";
import { serviceDb } from "@/server/db/service";
import { eventProvider } from "@/server/providers/events";
import { EventProviderError, type ExternalEvent } from "@/server/providers/events/types";

export type ImportResult =
  | { ok: true; artistName: string; provider: string; events: ExternalEvent[] }
  | { ok: false; error: string };

/**
 * Fetch an artist's announced tour dates from the configured event provider
 * (Bandsintown → Ticketmaster → offline demo) so the label can prefill the
 * show form instead of typing venue/city/date by hand.
 */
export async function searchArtistEvents(artistId: string): Promise<ImportResult> {
  try {
    const context = await requireLabelWithCompany();
    const id = z.string().uuid().parse(artistId);

    const { data: artist } = await serviceDb()
      .from("artists")
      .select("name, company_id")
      .eq("id", id)
      .maybeSingle();
    if (!artist || artist.company_id !== context.companyId) {
      return { ok: false, error: "Artist not found in your roster" };
    }

    const provider = eventProvider();
    const events = await provider.searchEvents(artist.name);
    return { ok: true, artistName: artist.name, provider: provider.name, events: events.slice(0, 40) };
  } catch (err) {
    if (err instanceof AuthError) return { ok: false, error: err.message };
    if (err instanceof EventProviderError) return { ok: false, error: err.message };
    return { ok: false, error: "Couldn't reach the tour-date provider. Try again." };
  }
}
