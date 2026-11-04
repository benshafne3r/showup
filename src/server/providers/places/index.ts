import "server-only";

import { matchCities, type CityRow, type CitySuggestion } from "@/lib/places";
import rows from "./us-cities.json";

/**
 * US city type-ahead from an offline list (no API, no cost): every US
 * city/town with 1,000+ people. Data: GeoNames, CC BY 4.0
 * (https://www.geonames.org); rebuilt by scripts/build-us-cities.ts.
 */
export function searchCities(query: string, limit = 6): CitySuggestion[] {
  return matchCities(rows as CityRow[], query, limit);
}
