import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { checkPost, detectPlatform } from "@/server/providers/social-metrics";

/**
 * Content verification + view tracking: confirm each submitted post is still
 * live and pull its view/like counts so labels can see what a booking earned.
 * One job per submission (scheduler: every 6 hours per post).
 *
 * Verification is a separate axis from the human review `status` on purpose:
 * that enum gates creator payouts and must never be written by a scraper.
 */

export type VerifyOutcome = "live" | "gone" | "unknown" | "unsupported" | "skipped";

/**
 * Job: check one submitted post (the scheduler enqueues each due submission
 * every 6 hours). Every write is per-row and idempotent.
 */
export async function verifyContentSubmission(
  submissionId: string,
  db: SupabaseClient<Database>,
): Promise<VerifyOutcome> {
  const { data: submission, error } = await db
    .from("content_submissions")
    .select("id, post_url, status, verification_status")
    .eq("id", submissionId)
    .maybeSingle();
  if (error) throw new Error(`load submission: ${error.message}`);
  if (!submission || !["submitted", "approved"].includes(submission.status)) return "skipped";

  const checkedAt = new Date().toISOString();
  const platform = detectPlatform(submission.post_url);
  const metrics = await checkPost(submission.post_url);
  const write = async (fields: Database["public"]["Tables"]["content_submissions"]["Update"]) => {
    const res = await db.from("content_submissions").update(fields).eq("id", submission.id);
    if (res.error) throw new Error(`record content check: ${res.error.message}`);
  };
  if (metrics === null) {
    // Platform not auto-checkable yet: stamp the attempt so it isn't re-picked.
    await write({ platform, last_checked_at: checkedAt });
    return "unsupported";
  }
  if (metrics.status === "ok") {
    await write({
      platform,
      verification_status: "live",
      last_checked_at: checkedAt,
      // A live hit with missing counts keeps the previous numbers.
      ...(metrics.viewCount != null ? { view_count: metrics.viewCount } : {}),
      ...(metrics.likeCount != null ? { like_count: metrics.likeCount } : {}),
    });
    return "live";
  }
  if (metrics.status === "gone") {
    // Keep the last known counts: "it had 40k views and then vanished" is
    // exactly what the label wants to see.
    await write({ platform, verification_status: "gone", last_checked_at: checkedAt });
    return "gone";
  }
  // Inconclusive lookup: a post already seen live HOLDS its live badge, so an
  // API outage can't flap every submission to "can't verify".
  const nextStatus = submission.verification_status === "live" ? "live" : "unknown";
  await write({ platform, verification_status: nextStatus, last_checked_at: checkedAt });
  return "unknown";
}
