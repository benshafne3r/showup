import { describe, expect, it } from "vitest";
import { fallbackHoldExpiry, hoursLeft, MAX_AUTHORIZATION_WINDOW_DAYS, SHORTEST_HOLD_VALIDITY_MS } from "@/lib/holds";
import { showIsOver } from "@/lib/dates";
import { AUTHORIZATION_TRANSITIONS, canTransition } from "@/lib/statuses";

const HOUR = 3_600_000;

describe("hold timing", () => {
  it("never places a hold so early that a Visa hold lapses before the show", () => {
    expect(MAX_AUTHORIZATION_WINDOW_DAYS * 24 * HOUR).toBeLessThan(SHORTEST_HOLD_VALIDITY_MS);
  });

  it("assumes the shortest network window when the provider gives no expiry", () => {
    const placed = new Date("2026-10-11T00:00:00Z");
    expect(fallbackHoldExpiry(placed).toISOString()).toBe("2026-10-15T18:00:00.000Z");
  });

  it("counts whole hours left and stops at zero", () => {
    const now = new Date("2026-10-14T12:00:00Z");
    expect(hoursLeft("2026-10-15T18:30:00Z", now)).toBe(30);
    expect(hoursLeft("2026-10-14T11:00:00Z", now)).toBe(0);
  });

  it("a hold placed 2 days out still covers the morning after the show", () => {
    // Show on Oct 13, hold placed at midnight UTC Oct 11, Visa expiry Oct 15 18:00 UTC.
    const expiry = fallbackHoldExpiry(new Date("2026-10-11T00:00:00Z"));
    expect(showIsOver("2026-10-13", expiry)).toBe(true);
    expect(hoursLeft(expiry.toISOString(), new Date("2026-10-14T08:00:00Z"))).toBeGreaterThanOrEqual(24);
  });
});

describe("showIsOver", () => {
  it("waits until 08:00 UTC the next day, after late US shows end", () => {
    expect(showIsOver("2026-10-13", new Date("2026-10-14T03:00:00Z"))).toBe(false); // 11pm ET show night
    expect(showIsOver("2026-10-13", new Date("2026-10-14T08:00:00Z"))).toBe(true);
  });
});

describe("expired holds", () => {
  it("only an active hold can expire, and an expired hold is final", () => {
    expect(canTransition(AUTHORIZATION_TRANSITIONS, "authorized", "expired")).toBe(true);
    expect(canTransition(AUTHORIZATION_TRANSITIONS, "scheduled", "expired")).toBe(false);
    expect(canTransition(AUTHORIZATION_TRANSITIONS, "expired", "captured")).toBe(false);
  });
});
