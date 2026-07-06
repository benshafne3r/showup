import "server-only";

import { serverEnv } from "@/lib/env";
import { log, errorFields } from "@/server/log";

/**
 * Spotify catalog access via the Client Credentials flow (no user login — the
 * app authenticates with its own id/secret and reads public catalog data).
 * Used to search artists and pull their profile photo. Degrades gracefully:
 * with no credentials, `searchArtists` returns [] and callers fall back to
 * manual entry.
 */

export type SpotifyArtist = {
  spotifyId: string;
  name: string;
  genre: string; // first genre, title-cased-ish as Spotify returns it
  imageUrl: string | null;
  spotifyUrl: string;
  followers: number;
};

export function spotifyConfigured(): boolean {
  return Boolean(serverEnv.spotifyClientId && serverEnv.spotifyClientSecret);
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  if (!spotifyConfigured()) return null;
  // Reuse the token until ~1 min before expiry.
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) {
    return cachedToken.value;
  }
  const basic = Buffer.from(
    `${serverEnv.spotifyClientId}:${serverEnv.spotifyClientSecret}`,
  ).toString("base64");
  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      cache: "no-store",
    });
    if (!res.ok) {
      log.error("Spotify token request failed", { status: res.status });
      return null;
    }
    const data = (await res.json()) as { access_token: string; expires_in: number };
    cachedToken = {
      value: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    return cachedToken.value;
  } catch (err) {
    log.error("Spotify token request errored", errorFields(err));
    return null;
  }
}

type SpotifyApiArtist = {
  id: string;
  name: string;
  genres: string[];
  images: { url: string; width: number; height: number }[];
  external_urls: { spotify: string };
  followers: { total: number };
};

/** Search Spotify's artist catalog. Returns [] when unconfigured or on error. */
export async function searchArtists(query: string, limit = 8): Promise<SpotifyArtist[]> {
  const q = query.trim();
  if (!q) return [];
  const token = await getAccessToken();
  if (!token) return [];

  try {
    const url = new URL("https://api.spotify.com/v1/search");
    url.searchParams.set("q", q);
    url.searchParams.set("type", "artist");
    url.searchParams.set("limit", String(Math.min(limit, 20)));
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      log.error("Spotify search failed", { status: res.status });
      return [];
    }
    const data = (await res.json()) as { artists?: { items: SpotifyApiArtist[] } };
    return (data.artists?.items ?? []).map((a) => ({
      spotifyId: a.id,
      name: a.name,
      genre: a.genres[0] ?? "",
      // images are ordered largest-first; 320px is plenty for a card.
      imageUrl: a.images[1]?.url ?? a.images[0]?.url ?? null,
      spotifyUrl: a.external_urls.spotify,
      followers: a.followers.total,
    }));
  } catch (err) {
    log.error("Spotify search errored", errorFields(err));
    return [];
  }
}
