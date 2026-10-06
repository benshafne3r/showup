import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { checkPost, detectPlatform } from "@/server/providers/social-metrics";
import { log, errorFields } from "@/server/log";

/**
 * Content verification + view tracking: confirm each submitted post is still
 * live and pull its view/like counts so labels can see what a booking earned.
 * Runs from the scheduled-jobs tick; every write is per-row and idempotent,
 * so a partial batch simply resumes on the next tick.
 *
 * Verification is a separate axis from the human review `status` on purpose:
 * that enum gates creator payouts and must never be written by a scraper.
 */

const RECHECK_HOURS = 6;
const BATCH_SIZE = 25;
/** Pause between external lookups — the TikWM quota is shared with other 50-50 tools. */
const PACING_MS = 250;

export type VerifyCounts = {
  checked: number;
  live: number;
  gone: number;
  unknown: number;
  unsupported: number;
  failed: number;
};

export async function verifyContentSubmissions(
  db: SupabaseClient<Database>,
): Promise<VerifyCounts> {
  const counts: VerifyCounts = {
    checked: 0,
    live: 0,
    gone: 0,
    unknown: 0,
    unsupported: 0,
    failed: 0,
  };
  const cutoff = new Date(Date.now() - RECHECK_HOURS * 3600 * 1000).toISOString();
  const { data: due } = await db
    .from("content_submissions")
    .select("id, post_url, verification_status")
    .in("status", ["submitted", "approved"])
    .or(`last_checked_at.is.null,last_checked_at.lt.${cutoff}`)
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE);

  for (const submission of due ?? []) {
    try {
      const checkedAt = new Date().toISOString();
      const platform = detectPlatform(submission.post_url);
      const metrics = await checkPost(submission.post_url);
      if (metrics === null) {
        // Platform not auto-checkable yet — stamp the attempt anyway so the
        // batch rotates instead of re-picking the same rows every tick.
        await db
          .from("content_submissions")
          .update({ platform, last_checked_at: checkedAt })
          .eq("id", submission.id);
        counts.unsupported++;
      } else if (metrics.status === "ok") {
        await db
          .from("content_submissions")
          .update({
            platform,
            verification_status: "live",
            last_checked_at: checkedAt,
            // A live hit with missing counts keeps the previous numbers.
            ...(metrics.viewCount != null ? { view_count: metrics.viewCount } : {}),
            ...(metrics.likeCount != null ? { like_count: metrics.likeCount } : {}),
          })
          .eq("id", submission.id);
        counts.live++;
      } else if (metrics.status === "gone") {
        // Keep the last known counts — "it had 40k views and then vanished"
        // is exactly what the label wants to see.
        await db
          .from("content_submissions")
          .update({ platform, verification_status: "gone", last_checked_at: checkedAt })
          .eq("id", submission.id);
        counts.gone++;
      } else {
        // Inconclusive lookup: a post already seen live HOLDS its live badge —
        // an API outage must not flap every submission to "can't verify".
        const nextStatus = submission.verification_status === "live" ? "live" : "unknown";
        await db
          .from("content_submissions")
          .update({ platform, verification_status: nextStatus, last_checked_at: checkedAt })
          .eq("id", submission.id);
        counts.unknown++;
      }
      counts.checked++;
      await new Promise((resolve) => setTimeout(resolve, PACING_MS));
    } catch (err) {
      counts.failed++;
      log.error("Content verification failed for a submission", {
        submissionId: submission.id,
        ...errorFields(err),
      });
    }
  }
  return counts;
}
