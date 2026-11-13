import { describe, expect, it } from "vitest";
import { distanceMeters, formatDistance, locationCheckInVerdict, venueGeocodeQueries } from "@/lib/geo";

const GREEK_THEATRE = { lat: 34.1197, lng: -118.2962 };

describe("distanceMeters", () => {
  it("is ~0 for the same point and sane across town", () => {
    expect(distanceMeters(GREEK_THEATRE, GREEK_THEATRE)).toBeCloseTo(0, 5);
    // Greek Theatre → Hollywood Bowl is roughly 4 km.
    const d = distanceMeters(GREEK_THEATRE, { lat: 34.1122, lng: -118.3391 });
    expect(d).toBeGreaterThan(3500);
    expect(d).toBeLessThan(4500);
  });
});

describe("locationCheckInVerdict", () => {
  it("accepts a creator inside the venue radius", () => {
    expect(locationCheckInVerdict(120, 20)).toBe("at_venue");
  });
  it("gives back some of the phone's uncertainty, but not unlimited", () => {
    expect(locationCheckInVerdict(450, 120)).toBe("at_venue"); // 350 + 120
    expect(locationCheckInVerdict(600, 900)).toBe("too_far"); // allowance capped at 150
  });
  it("rejects people across town", () => {
    expect(locationCheckInVerdict(4000, 10)).toBe("too_far");
  });
  it("refuses fixes too vague to prove anything", () => {
    expect(locationCheckInVerdict(100, 5000)).toBe("imprecise");
    expect(locationCheckInVerdict(100, Number.NaN)).toBe("imprecise");
  });
});

describe("formatDistance", () => {
  it("uses meters up close and miles further out", () => {
    expect(formatDistance(347)).toBe("350 m");
    expect(formatDistance(4023)).toBe("2.5 mi");
  });
});

describe("venueGeocodeQueries", () => {
  it("falls back to the name without a leading 'The' or the country", () => {
    expect(
      venueGeocodeQueries({ name: "The Fonda Theatre", address: null, city: "Los Angeles", state: "CA", country: "US" }),
    ).toEqual(["The Fonda Theatre, Los Angeles, CA, US", "Fonda Theatre, Los Angeles, CA"]);
  });

  it("tries the street address first and skips duplicates and blanks", () => {
    expect(
      venueGeocodeQueries({ name: "Echoplex", address: "1154 Glendale Blvd", city: "Los Angeles", state: null, country: null }),
    ).toEqual(["1154 Glendale Blvd, Los Angeles", "Echoplex, Los Angeles"]);
  });
});
