import "server-only";

import { serverEnv } from "@/lib/env";
import { log, errorFields } from "@/server/log";
import type { PostMetrics } from "./types";
import {
  decideFromFeed,
  feedNumber,
  isShortLink,
  parseCanonical,
  type FeedItem,
} from "./tiktok-logic";

/** Free endpoint — no key, same {code, data} shape as Pro. */
const TIKWM_FREE_API = "https://www.tikwm.com/api/";

const FEED_PAGE_SIZE = 30;
const FEED_MAX_PAGES = 6;
const FEED_TTL_MS = 180_000;
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

// handle → cached feed. `exhausted` = the walk reached the feed's end, so a
// missing video id there PROVES the post is gone rather than merely too old
// to have been paged to.
const feedCache = new Map<string, { expiresAt: number; items: FeedItem[]; exhausted: boolean }>();
// Dedupe concurrent walks of one handle (a batch often has many posts per creator).
const feedInFlight = new Map<string, Promise<{ items: FeedItem[]; exhausted: boolean }>>();

async function fetchJson(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 401 || res.status === 403) {
      log.warn("TikWM rejected the key, check TIKWM_API_KEY", { status: res.status });
      return null;
    }
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    log.warn("TikWM request failed", { url: url.split("?")[0], ...errorFields(err) });
    return null;
  }
}

function dataOf(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, unknown>;
  const data = body.data;
  if (data && typeof data === "object") return data as Record<string, unknown>;
  // Some responses put the video object at the top level.
  return "play_count" in body ? body : null;
}

/**
 * Per-video `?url=` lookup: Pro first (keyed, reliable), then the free host.
 * A null means nothing more precise than "no data" — this endpoint answers the
 * same error for a deleted video as for a link it won't parse, so callers that
 * care about the difference must go through the profile feed.
 */
async function urlLookup(url: string): Promise<Record<string, unknown> | null> {
  const attempts: Array<{ base: string; headers: Record<string, string> }> = [];
  if (serverEnv.tikwmApiKey) {
    attempts.push({
      base: serverEnv.tikwmApiBase,
      headers: { "x-tikwmapi-key": serverEnv.tikwmApiKey },
    });
  }
  attempts.push({ base: TIKWM_FREE_API, headers: {} });
  for (const attempt of attempts) {
    const query = new URLSearchParams({ url, hd: "0" });
    const payload = await fetchJson(
      `${attempt.base.replace(/\/+$/, "")}/?${query}`,
      attempt.headers,
      20_000,
    );
    const data = dataOf(payload);
    if (data) return data;
  }
  return null;
}

/** GET a TikWM Pro endpoint. Returns the `data` object of a code-0 reply, or null. */
async function tikwmProGet(
  path: string,
  params: Record<string, string>,
): Promise<Record<string, unknown> | null> {
  if (!serverEnv.tikwmApiKey) return null;
  const query = new URLSearchParams(params);
  const payload = await fetchJson(
    `${serverEnv.tikwmApiBase.replace(/\/+$/, "")}${path}?${query}`,
    { "x-tikwmapi-key": serverEnv.tikwmApiKey },
    25_000,
  );
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, unknown>;
  if (body.code !== 0) return null;
  const data = body.data;
  return data && typeof data === "object" ? (data as Record<string, unknown>) : null;
}

/**
 * (items, exhausted) for @handle, newest first, cached for FEED_TTL_MS. On a
 * mid-walk failure returns what it has WITHOUT caching, so the next check
 * retries and a half-read feed is never mistaken for "this post is deleted".
 */
async function feedItems(handle: string): Promise<{ items: FeedItem[]; exhausted: boolean }> {
  const key = handle.toLowerCase();
  const hit = feedCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return { items: hit.items, exhausted: hit.exhausted };
  const inFlight = feedInFlight.get(key);
  if (inFlight) return inFlight;
  const walk = (async () => {
    const items: FeedItem[] = [];
    let cursor = "0";
    let exhausted = false;
    for (let page = 0; page < FEED_MAX_PAGES; page++) {
      const data = await tikwmProGet("/user/posts", {
        unique_id: handle,
        count: String(FEED_PAGE_SIZE),
        cursor,
        sort_type: "0",
      });
      if (data === null) return { items, exhausted: false };
      const pageItems = (data.videos ?? data.itemList ?? data.aweme_list ?? []) as FeedItem[];
      items.push(...pageItems);
      const rawCursor = data.cursor;
      cursor = rawCursor == null || rawCursor === 0 ? "" : String(rawCursor);
      if (!pageItems.length || !data.hasMore || !cursor) {
        exhausted = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 300)); // be gentle across pages
    }
    feedCache.set(key, { expiresAt: Date.now() + FEED_TTL_MS, items, exhausted });
    return { items, exhausted };
  })();
  feedInFlight.set(key, walk);
  try {
    return await walk;
  } finally {
    feedInFlight.delete(key);
  }
}

/** Follow a vm./vt. short link to its canonical /@handle/video/<id> form
 * (unchanged on failure). The profile feed is only reachable via the @handle. */
async function resolveShortLink(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": MOBILE_UA },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    return res.url || url;
  } catch {
    return url;
  }
}

function metricsFrom(data: Record<string, unknown>): PostMetrics {
  return {
    status: "ok",
    viewCount: feedNumber(data, "play_count", "playCount"),
    likeCount: feedNumber(data, "digg_count", "diggCount"),
  };
}

/** Check a TikTok post is live and pull its view/like counts. */
export async function checkTikTokPost(url: string): Promise<PostMetrics> {
  const direct = await urlLookup(url);
  if (direct) return metricsFrom(direct);

  const canonicalUrl = isShortLink(url) ? await resolveShortLink(url) : url;
  const parsed = parseCanonical(canonicalUrl);
  if (!parsed || !serverEnv.tikwmApiKey) {
    return { status: "unknown", viewCount: null, likeCount: null };
  }
  const { items, exhausted } = await feedItems(parsed.handle);
  if (!items.length) {
    // Private, deleted, banned — or the API hiccuped. Indistinguishable here,
    // and guessing wrong flags a live post as removed, so hold as unknown.
    log.warn("TikTok feed came back empty, holding", {
      handle: parsed.handle,
      videoId: parsed.videoId,
    });
    return { status: "unknown", viewCount: null, likeCount: null };
  }
  const decision = decideFromFeed(parsed.videoId, items, exhausted);
  if (decision.status === "ok") return metricsFrom(decision.item);
  return { status: decision.status, viewCount: null, likeCount: null };
}
