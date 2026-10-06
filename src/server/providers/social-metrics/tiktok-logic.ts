/**
 * Pure TikTok-lookup logic (no fetch, unit-testable). Ported from the
 * production Soundwave Edits bot: TikWM's per-video `?url=` endpoint answers
 * the same error for a deleted video as for a link it won't parse, so the
 * author's profile feed is the only trustworthy arbiter of "is this post
 * actually gone?" — and these helpers encode that arbitration.
 */

export type FeedItem = Record<string, unknown>;

const CANONICAL_RE = /tiktok\.com\/@([\w.-]+)\/(?:video|photo)\/(\d+)/;
const SHORT_LINK_RE = /^https?:\/\/(?:(?:vm|vt)\.tiktok\.com\/|(?:www\.)?tiktok\.com\/t\/)/i;

/**
 * A TikTok video id carries its post time in the high 32 bits (unix seconds).
 * The margin absorbs the rare id whose encoded time drifts from its
 * create_time (~13h was the worst seen in the wild).
 */
export const ID_TS_MARGIN_SECONDS = 86_400;

export function parseCanonical(url: string): { handle: string; videoId: string } | null {
  const m = CANONICAL_RE.exec(url ?? "");
  return m ? { handle: m[1], videoId: m[2] } : null;
}

export function isShortLink(url: string): boolean {
  return SHORT_LINK_RE.test((url ?? "").trim());
}

export function timestampFromVideoId(videoId: string): number | null {
  try {
    // BigInt(32), not a 32n literal — the tsconfig target predates ES2020.
    const ts = Number(BigInt(videoId) >> BigInt(32));
    return Number.isFinite(ts) && ts > 0 ? ts : null;
  } catch {
    return null;
  }
}

/** First numeric value under any of `keys`, in the post or its nested stats blob. */
export function feedNumber(item: FeedItem, ...keys: string[]): number | null {
  const sources: Record<string, unknown>[] = [item];
  for (const nested of ["stats", "statistics"]) {
    const value = item[nested];
    if (value && typeof value === "object") sources.push(value as Record<string, unknown>);
  }
  for (const src of sources) {
    for (const key of keys) {
      const raw = src[key];
      if (raw == null) continue;
      const num = Number(raw);
      if (Number.isFinite(num)) return Math.trunc(num);
    }
  }
  return null;
}

export type FeedDecision =
  | { status: "ok"; item: FeedItem }
  | { status: "gone" }
  | { status: "unknown" };

/**
 * Decide a post's fate from its author's feed (newest first). 'gone' only when
 * the post is missing from a stretch of feed that SHOULD have contained it:
 * either the whole feed was read (`exhausted`), or the id's embedded timestamp
 * falls inside the window the pages covered. An empty feed or an older post
 * stays 'unknown' — guessing wrong turns an API blip into a false takedown.
 */
export function decideFromFeed(videoId: string, items: FeedItem[], exhausted: boolean): FeedDecision {
  for (const item of items) {
    const ids = ["video_id", "aweme_id", "id"].map((key) => String(item[key] ?? ""));
    if (ids.includes(videoId)) return { status: "ok", item };
  }
  if (!items.length) return { status: "unknown" };
  if (exhausted) return { status: "gone" };
  const oldest = Math.min(...items.map((item) => feedNumber(item, "create_time") ?? 0));
  const ts = timestampFromVideoId(videoId);
  if (ts && oldest && ts > oldest + ID_TS_MARGIN_SECONDS) return { status: "gone" };
  return { status: "unknown" };
}
