import { describe, expect, it } from "vitest";

import {
  ID_TS_MARGIN_SECONDS,
  decideFromFeed,
  feedNumber,
  isShortLink,
  parseCanonical,
  timestampFromVideoId,
} from "@/server/providers/social-metrics/tiktok-logic";
import { detectPlatform } from "@/server/providers/social-metrics";

// A video id whose high 32 bits encode a known unix timestamp.
const POSTED_AT = 1_700_000_000;
const VIDEO_ID = String(BigInt(POSTED_AT) << BigInt(32));

describe("parseCanonical", () => {
  it("parses canonical video links, with query strings", () => {
    expect(
      parseCanonical(`https://www.tiktok.com/@some.user_1/video/${VIDEO_ID}?is_from_webapp=1`),
    ).toEqual({ handle: "some.user_1", videoId: VIDEO_ID });
  });

  it("parses photo posts", () => {
    expect(parseCanonical(`https://tiktok.com/@a-b/photo/${VIDEO_ID}`)).toEqual({
      handle: "a-b",
      videoId: VIDEO_ID,
    });
  });

  it("rejects short links and other platforms", () => {
    expect(parseCanonical("https://vm.tiktok.com/ZMabc123/")).toBeNull();
    expect(parseCanonical("https://www.instagram.com/reel/xyz/")).toBeNull();
  });
});

describe("isShortLink", () => {
  it("matches vm./vt./t/ forms only", () => {
    expect(isShortLink("https://vm.tiktok.com/ZMabc/")).toBe(true);
    expect(isShortLink("https://vt.tiktok.com/ZSabc/")).toBe(true);
    expect(isShortLink("https://www.tiktok.com/t/ZTabc/")).toBe(true);
    expect(isShortLink(`https://www.tiktok.com/@user/video/${VIDEO_ID}`)).toBe(false);
  });
});

describe("timestampFromVideoId", () => {
  it("recovers the post time from the high 32 bits", () => {
    expect(timestampFromVideoId(VIDEO_ID)).toBe(POSTED_AT);
  });

  it("returns null for non-numeric ids", () => {
    expect(timestampFromVideoId("not-an-id")).toBeNull();
    expect(timestampFromVideoId("")).toBeNull();
  });
});

describe("feedNumber", () => {
  it("reads numbers from the item or its nested stats blob, coercing strings", () => {
    expect(feedNumber({ play_count: "123" }, "play_count")).toBe(123);
    expect(feedNumber({ stats: { playCount: 5 } }, "play_count", "playCount")).toBe(5);
    expect(feedNumber({ statistics: { digg_count: 7 } }, "digg_count")).toBe(7);
    expect(feedNumber({}, "play_count")).toBeNull();
  });
});

describe("decideFromFeed", () => {
  const present = { video_id: VIDEO_ID, play_count: 10, create_time: POSTED_AT };

  it("finds a post by any id field", () => {
    expect(decideFromFeed(VIDEO_ID, [present], false).status).toBe("ok");
    expect(decideFromFeed(VIDEO_ID, [{ aweme_id: VIDEO_ID }], false).status).toBe("ok");
    expect(decideFromFeed(VIDEO_ID, [{ id: VIDEO_ID }], false).status).toBe("ok");
  });

  it("holds as unknown on an empty feed, even an 'exhausted' one", () => {
    expect(decideFromFeed(VIDEO_ID, [], true).status).toBe("unknown");
  });

  it("confirms gone when the whole feed was read and the post is absent", () => {
    expect(decideFromFeed(VIDEO_ID, [{ video_id: "1", create_time: 1 }], true).status).toBe("gone");
  });

  it("confirms gone when the post was newer than the stretch of feed read", () => {
    const older = { video_id: "1", create_time: POSTED_AT - ID_TS_MARGIN_SECONDS - 10 };
    expect(decideFromFeed(VIDEO_ID, [older], false).status).toBe("gone");
  });

  it("holds as unknown when the post predates the pages read", () => {
    const newer = { video_id: "1", create_time: POSTED_AT + 10 };
    expect(decideFromFeed(VIDEO_ID, [newer], false).status).toBe("unknown");
  });
});

describe("detectPlatform", () => {
  it("detects by hostname, not substring", () => {
    expect(detectPlatform("https://www.tiktok.com/@u/video/1")).toBe("tiktok");
    expect(detectPlatform("https://vm.tiktok.com/ZM1/")).toBe("tiktok");
    expect(detectPlatform("https://instagram.com/reel/x/")).toBe("instagram");
    expect(detectPlatform("https://youtu.be/abc")).toBe("youtube");
    expect(detectPlatform("https://x.com/user/status/1")).toBe("twitter");
    expect(detectPlatform("https://mymix.com/post/1")).toBe("other");
    expect(detectPlatform("not a url")).toBe("other");
  });
});
