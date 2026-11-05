import { describe, expect, it } from "vitest";
import { isShowDay, showDatePassed, showToday } from "@/lib/dates";

/** Show dates are venue-local; "today" follows the US day (Hawaii, the last to turn over). */
describe("showToday", () => {
  it("turns over at 10:00 UTC (3 am Pacific, 6 am Eastern)", () => {
    expect(showToday(new Date("2026-11-05T09:59:00Z"))).toBe("2026-11-04");
    expect(showToday(new Date("2026-11-05T10:00:00Z"))).toBe("2026-11-05");
  });

  it("doesn't open check-in the evening before a US show", () => {
    // 5 pm Pacific on Nov 4 is already Nov 5 in UTC.
    expect(isShowDay("2026-11-05", new Date("2026-11-05T01:00:00Z"))).toBe(false);
    expect(isShowDay("2026-11-05", new Date("2026-11-05T14:00:00Z"))).toBe(true);
  });

  it("keeps tonight's show open until the US day is over", () => {
    // 9 pm Pacific on Nov 4: tonight's show hasn't happened yet.
    expect(showDatePassed("2026-11-04", new Date("2026-11-05T05:00:00Z"))).toBe(false);
    expect(showDatePassed("2026-11-04", new Date("2026-11-05T10:00:00Z"))).toBe(true);
  });
});
