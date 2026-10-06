export type PostCheckStatus = "ok" | "gone" | "unknown";

export type PostMetrics = {
  /**
   * 'ok'      — post found live; counts are current.
   * 'gone'    — CONFIRMED deleted/private (absent from a stretch of its
   *             author's feed that should have contained it).
   * 'unknown' — couldn't tell (API miss, no key, post older than the feed
   *             pages read). Callers must NOT treat this as a takedown.
   */
  status: PostCheckStatus;
  viewCount: number | null;
  likeCount: number | null;
};
