import "server-only";

import { serviceDb } from "@/server/db/service";

export class RateLimitError extends Error {
  constructor() {
    super("Too many attempts. Please wait a moment and try again.");
    this.name = "RateLimitError";
  }
}

const LIMITS: Record<string, { windowSeconds: number; max: number }> = {
  "auth.sign_in": { windowSeconds: 300, max: 10 },
  "auth.sign_up": { windowSeconds: 3600, max: 8 },
  "auth.reset": { windowSeconds: 3600, max: 6 },
  "request.create": { windowSeconds: 3600, max: 20 },
  "message.send": { windowSeconds: 60, max: 30 },
  "support.message": { windowSeconds: 3600, max: 5 },
  "payment_method.attach": { windowSeconds: 3600, max: 10 },
  "upload.file": { windowSeconds: 3600, max: 60 },
  // Type-ahead lookups (Spotify search, venue suggestions, artist details).
  "lookup.search": { windowSeconds: 60, max: 120 },
  "lookup.tour_dates": { windowSeconds: 3600, max: 60 },
  // Shared across all labels: Ticketmaster's key allows 5,000 calls a day.
  "ticketmaster.daily": { windowSeconds: 86_400, max: 4_000 },
};

/**
 * Fixed-window rate limiter backed by Postgres. Key by action + subject
 * (user id or normalized identifier). Throws RateLimitError when exceeded.
 */
/** enforceRateLimit as a yes/no, for lookups that should quietly come back empty. */
export async function withinRateLimit(action: keyof typeof LIMITS, subject: string): Promise<boolean> {
  try {
    await enforceRateLimit(action, subject);
    return true;
  } catch (err) {
    if (err instanceof RateLimitError) return false;
    throw err;
  }
}

export async function enforceRateLimit(action: keyof typeof LIMITS, subject: string): Promise<void> {
  const limit = LIMITS[action];
  if (!limit) return;

  const windowMs = limit.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs).toISOString();
  const key = `${action}:${subject}`;
  const db = serviceDb();

  const { data: existing } = await db
    .from("rate_limits")
    .select("count")
    .eq("key", key)
    .eq("window_start", windowStart)
    .maybeSingle();

  if (existing && existing.count >= limit.max) throw new RateLimitError();

  if (existing) {
    await db
      .from("rate_limits")
      .update({ count: existing.count + 1 })
      .eq("key", key)
      .eq("window_start", windowStart);
  } else {
    // Benign race: concurrent first hits may both insert-or-conflict; the
    // limiter is advisory backpressure, exactness is not required.
    await db.from("rate_limits").upsert({ key, window_start: windowStart, count: 1 });
  }
}
