import "server-only";

import { serverEnv } from "@/lib/env";
import { log, errorFields } from "@/server/log";

/**
 * Best-effort artist enrichment from free, keyless public sources, since
 * Spotify's API exposes neither a bio nor social links:
 * - Instagram handle ← MusicBrainz artist URL relations
 * - Bio ← Wikipedia page summary
 *
 * Everything degrades to an empty string on miss/error, so a failed lookup
 * never blocks saving the artist.
 */

const UA = "ShowUp/1.0 (artist enrichment; contact: notifications@showup.app)";

export type ArtistEnrichment = { bio: string; instagram: string };

type MbSearch = { artists?: { id?: string }[] };
type MbRelations = { relations?: { url?: { resource?: string } }[] };
type WikiSummary = { type?: string; extract?: string };

export async function enrichArtist(name: string): Promise<ArtistEnrichment> {
  const q = name.trim();
  if (!q || serverEnv.externalLookups === "fake") return { bio: "", instagram: "" };
  const [instagram, bio] = await Promise.all([
    instagramFromMusicBrainz(q),
    bioFromWikipedia(q),
  ]);
  return { bio, instagram };
}

async function instagramFromMusicBrainz(name: string): Promise<string> {
  try {
    const search = await fetchJson<MbSearch>(
      `https://musicbrainz.org/ws/2/artist?query=artist:${encodeURIComponent(name)}&fmt=json&limit=1`,
    );
    const mbid = search.artists?.[0]?.id;
    if (!mbid) return "";
    const rel = await fetchJson<MbRelations>(
      `https://musicbrainz.org/ws/2/artist/${mbid}?inc=url-rels&fmt=json`,
    );
    for (const r of rel.relations ?? []) {
      const url = r.url?.resource ?? "";
      const m = url.match(/instagram\.com\/([^/?#]+)/i);
      if (m) return m[1].replace(/\/+$/, "");
    }
    return "";
  } catch (err) {
    // Best effort (the bio/Instagram are optional), so not an alert-worthy error.
    log.warn("MusicBrainz enrichment failed", errorFields(err));
    return "";
  }
}

async function bioFromWikipedia(name: string): Promise<string> {
  try {
    const data = await fetchJson<WikiSummary>(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name.replace(/ /g, "_"))}`,
    );
    if (data.type === "disambiguation") return "";
    return (data.extract ?? "").trim().slice(0, 700);
  } catch (err) {
    log.warn("Wikipedia enrichment failed", errorFields(err));
    return "";
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  let res = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
  // MusicBrainz allows about one request a second and answers 503 past that: wait once and retry.
  if (res.status === 503 || res.status === 429) {
    await new Promise((r) => setTimeout(r, 1100));
    res = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
  }
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.json() as Promise<T>;
}
