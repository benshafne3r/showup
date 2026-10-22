import { describe, expect, it } from "vitest";
import { locationLabel, parseFollowerCount, parseRosterLocation } from "@/lib/roster";
import { showStateKey, stateKey } from "@/lib/us-states";

describe("parseFollowerCount", () => {
  it("reads CreatorCore's compact counts", () => {
    expect(parseFollowerCount("4.3M")).toBe(4_300_000);
    expect(parseFollowerCount("951.7K")).toBe(951_700);
    expect(parseFollowerCount("278")).toBe(278);
    expect(parseFollowerCount("1,204")).toBe(1204);
    expect(parseFollowerCount("")).toBe(0);
    expect(parseFollowerCount("n/a")).toBe(0);
  });
});

describe("parseRosterLocation", () => {
  it("splits city, state and country", () => {
    expect(parseRosterLocation("Los Angeles, California,  United States")).toEqual({
      city: "Los Angeles",
      region: "California",
      country: "US",
    });
  });
  it("treats two parts as state + country, one as country", () => {
    expect(parseRosterLocation("Kentucky, United States")).toEqual({ city: "", region: "Kentucky", country: "US" });
    expect(parseRosterLocation(" Spain")).toEqual({ city: "", region: "", country: "Spain" });
    expect(parseRosterLocation(null)).toEqual({ city: "", region: "", country: "" });
  });
  it("labels for display", () => {
    expect(locationLabel({ city: "Houston", region: "Texas", country: "US" })).toBe("Houston, Texas");
    expect(locationLabel({ city: "", region: "", country: "Spain" })).toBe("Spain");
    expect(locationLabel({ city: "", region: "", country: "US" })).toBe("");
  });
});

describe("state matching", () => {
  it("matches abbreviations and full names", () => {
    expect(stateKey("CA")).toBe("california");
    expect(stateKey("California")).toBe("california");
    expect(stateKey("Île-de-France")).toBe("");
  });
  it("falls back to the city's state for venues saved without one", () => {
    expect(showStateKey({ city: "Los Angeles", state: null })).toBe("california");
    expect(showStateKey({ city: "Somewhere", state: "TX" })).toBe("texas");
    expect(showStateKey({ city: "Paris", state: null })).toBe("");
  });
});
