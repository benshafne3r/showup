import { describe, expect, it } from "vitest";
import {
  authorizationAmountCents,
  formatCents,
  formatCentsCompact,
  parseDollarsToCents,
} from "@/lib/money";

describe("authorizationAmountCents (deposit calculation)", () => {
  it("matches the spec example: $100 ticket × 2 tickets × 50% = $100", () => {
    expect(authorizationAmountCents(10000, 2, 50)).toBe(10000);
  });

  it("computes single-ticket holds", () => {
    expect(authorizationAmountCents(10000, 1, 50)).toBe(5000);
    expect(authorizationAmountCents(12000, 1, 25)).toBe(3000);
    expect(authorizationAmountCents(8000, 1, 75)).toBe(6000);
    expect(authorizationAmountCents(9500, 1, 100)).toBe(9500);
  });

  it("applies the hold to every ticket including the +1", () => {
    expect(authorizationAmountCents(6500, 2, 25)).toBe(3250);
    expect(authorizationAmountCents(9500, 2, 100)).toBe(19000);
  });

  it("handles 0% and $0 values", () => {
    expect(authorizationAmountCents(10000, 2, 0)).toBe(0);
    expect(authorizationAmountCents(0, 1, 50)).toBe(0);
  });

  it("rounds fractional cents to the nearest cent", () => {
    // $33.33 × 1 × 50% = 1666.5 → 1667 (banker's? no — Math.round)
    expect(authorizationAmountCents(3333, 1, 50)).toBe(1667);
    // $0.01 × 1 × 25% = 0.25 → 0
    expect(authorizationAmountCents(1, 1, 25)).toBe(0);
  });

  it("rejects invalid inputs", () => {
    expect(() => authorizationAmountCents(-1, 1, 50)).toThrow();
    expect(() => authorizationAmountCents(100.5, 1, 50)).toThrow();
    expect(() => authorizationAmountCents(100, 0, 50)).toThrow();
    expect(() => authorizationAmountCents(100, 1.5, 50)).toThrow();
    expect(() => authorizationAmountCents(100, 1, -5)).toThrow();
    expect(() => authorizationAmountCents(100, 1, 101)).toThrow();
    expect(() => authorizationAmountCents(100, 1, 33.3)).toThrow();
  });
});

describe("formatCents", () => {
  it("formats cents as USD", () => {
    expect(formatCents(10000)).toBe("$100.00");
    expect(formatCents(12345)).toBe("$123.45");
    expect(formatCents(0)).toBe("$0.00");
  });

  it("compact format drops trailing .00", () => {
    expect(formatCentsCompact(15000)).toBe("$150");
    expect(formatCentsCompact(15050)).toBe("$150.50");
  });
});

describe("parseDollarsToCents", () => {
  it("parses whole and fractional amounts", () => {
    expect(parseDollarsToCents("120")).toBe(12000);
    expect(parseDollarsToCents("120.5")).toBe(12050);
    expect(parseDollarsToCents("120.50")).toBe(12050);
    expect(parseDollarsToCents("$1,200.99")).toBe(120099);
  });

  it("rejects garbage", () => {
    expect(() => parseDollarsToCents("abc")).toThrow();
    expect(() => parseDollarsToCents("-5")).toThrow();
    expect(() => parseDollarsToCents("1.234")).toThrow();
    expect(() => parseDollarsToCents("")).toThrow();
  });
});
