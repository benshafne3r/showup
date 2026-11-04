/**
 * Builds src/server/providers/places/us-cities.json, the offline list behind
 * the city type-ahead: every US city/town with 1,000+ people as
 * [name, state, population], biggest first. Neighborhood sections and
 * abandoned places are left out.
 *
 * Data: GeoNames (CC BY 4.0, https://www.geonames.org) via the
 * `all-the-cities` package. Re-run: npx tsx scripts/build-us-cities.ts
 */
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

type City = { name: string; country: string; featureCode: string; adminCode: string; population: number };
const all = createRequire(import.meta.url)("all-the-cities") as City[];

const best = new Map<string, [string, string, number]>();
for (const c of all) {
  if (c.country !== "US" || c.featureCode === "PPLX" || c.featureCode === "PPLQ") continue;
  const name = c.adminCode === "DC" ? "Washington" : c.name === "New York City" ? "New York" : c.name.split(",")[0].trim();
  const key = `${name.toLowerCase()}|${c.adminCode}`;
  const prev = best.get(key);
  if (!prev || prev[2] < c.population) best.set(key, [name, c.adminCode, c.population]);
}
const rows = [...best.values()].sort((a, b) => b[2] - a[2]);
writeFileSync("src/server/providers/places/us-cities.json", JSON.stringify(rows));
console.log(`${rows.length} cities`);
