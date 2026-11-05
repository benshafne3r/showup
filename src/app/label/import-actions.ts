"use server";

import { z } from "zod";
import { requireLabelWithCompany, AuthError } from "@/server/auth/guards";
import { findCompanyArtist } from "@/server/services/catalog";
import { enforceRateLimit, RateLimitError } from "@/server/services/rate-limit";
import { eventProvider } from "@/server/providers/events";
import { EventProviderError, type ExternalEvent } from "@/server/providers/events/types";

export type ImportResult =
  | { ok: true; provider: string; events: ExternalEvent[]; artistId: string | null }
  | { ok: false; error: string };

const artistSchema = z.object({ name: z.string().trim().min(1).max(120), spotifyUrl: z.string().url().or(z.literal("")).optional() });

/**
 * An artist's announced tour dates from the configured event provider
 * (Bandsintown → Ticketmaster → offline demo), matched on their Spotify link
 * where the provider can. Also returns the label's existing artist for that
 * pick (null if they don't have them yet), so the tour list can be filtered.
 */
export async function searchArtistEvents(artist: { name: string; spotifyUrl?: string }): Promise<ImportResult> {
  try {
    const context = await requireLabelWithCompany();
    const { name, spotifyUrl = "" } = artistSchema.parse(artist);
    await enforceRateLimit("lookup.tour_dates", context.user.id);
    await enforceRateLimit("ticketmaster.daily", "all");
    const provider = eventProvider();
    const [events, existing] = await Promise.all([
      provider.searchEvents(name, spotifyUrl || undefined),
      findCompanyArtist(context.companyId, name, spotifyUrl),
    ]);
    return { ok: true, provider: provider.name, events: events.slice(0, 40), artistId: existing?.id ?? null };
  } catch (err) {
    if (err instanceof AuthError) return { ok: false, error: err.message };
    if (err instanceof EventProviderError) return { ok: false, error: err.message };
    if (err instanceof RateLimitError) return { ok: false, error: "Too many lookups. Try again in a little while." };
    return { ok: false, error: "Couldn't reach the tour-date provider. Try again." };
  }
}
