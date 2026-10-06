import "server-only";

import type { Database } from "@/lib/database.types";
import type { PostMetrics } from "./types";
import { checkTikTokPost } from "./tikwm";

export type { PostCheckStatus, PostMetrics } from "./types";

type SocialPlatform = Database["public"]["Enums"]["social_platform"];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** Best-effort platform detection from a submitted post URL. */
export function detectPlatform(url: string): SocialPlatform {
  const host = hostOf(url);
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";
  if (host.endsWith("instagram.com") || host === "instagr.am") return "instagram";
  if (host.endsWith("youtube.com") || host === "youtu.be") return "youtube";
  if (host.endsWith("twitter.com") || host === "x.com" || host.endsWith(".x.com")) return "twitter";
  if (host.endsWith("twitch.tv")) return "twitch";
  return "other";
}

/**
 * Check a post is live and pull its metrics. Null → platform not auto-checkable
 * yet (the submission stays 'unchecked' rather than pretending we looked).
 */
export async function checkPost(url: string): Promise<PostMetrics | null> {
  return detectPlatform(url) === "tiktok" ? checkTikTokPost(url) : null;
}
