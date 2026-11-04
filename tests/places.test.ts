import { describe, expect, it } from "vitest";
import { matchCities, type CityRow } from "@/lib/places";

const ROWS: CityRow[] = [
  ["New York", "NY", 8_000_000],
  ["Milwaukee", "WI", 600_000],
  ["St. Louis", "MO", 300_000],
  ["Milpitas", "CA", 70_000],
  ["West New York", "NJ", 50_000],
  ["Milford", "CT", 50_000],
  ["Milford", "MA", 28_000],
];

describe("city type-ahead", () => {
  it("puts names that start with the text first, biggest first", () => {
    expect(matchCities(ROWS, "mil", 3)).toEqual([
      { city: "Milwaukee", state: "WI" },
      { city: "Milpitas", state: "CA" },
      { city: "Milford", state: "CT" },
    ]);
  });

  it("also matches a later word, after the starts-with matches", () => {
    expect(matchCities(ROWS, "new york")).toEqual([
      { city: "New York", state: "NY" },
      { city: "West New York", state: "NJ" },
    ]);
  });

  it("narrows by state after a comma and ignores periods and 'Saint'", () => {
    expect(matchCities(ROWS, "milford, ma")).toEqual([{ city: "Milford", state: "MA" }]);
    expect(matchCities(ROWS, "saint lo")).toEqual([{ city: "St. Louis", state: "MO" }]);
  });

  it("waits for two letters", () => {
    expect(matchCities(ROWS, "m")).toEqual([]);
  });
});
