import { cityKey } from "./cities";

/**
 * US states, for "nearby" matching: a show's venue state (often "CA") against a
 * creator's region (often "California"). Compare `stateKey()` values.
 */
const STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};
const BY_NAME = new Map(Object.values(STATES).map((name) => [name.toLowerCase(), name.toLowerCase()]));

/** "CA" / "California" / " california " → "california"; "" when it isn't a US state. */
export function stateKey(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  const abbr = STATES[v.toUpperCase()];
  if (abbr) return abbr.toLowerCase();
  return BY_NAME.get(v.toLowerCase()) ?? "";
}

/** States of the major markets, for venues saved without one. */
const CITY_STATE: Record<string, string> = {
  atlanta: "GA", austin: "TX", boston: "MA", charlotte: "NC", chicago: "IL",
  dallas: "TX", denver: "CO", detroit: "MI", houston: "TX", "las vegas": "NV",
  "los angeles": "CA", miami: "FL", minneapolis: "MN", nashville: "TN",
  "new orleans": "LA", "new york": "NY", newark: "NJ", philadelphia: "PA",
  phoenix: "AZ", portland: "OR", "san diego": "CA", "san francisco": "CA",
  seattle: "WA", washington: "DC", brooklyn: "NY", oakland: "CA", "san jose": "CA",
  sacramento: "CA", inglewood: "CA", anaheim: "CA", "salt lake city": "UT",
  "saint paul": "MN", "st. paul": "MN", morrison: "CO", orlando: "FL", tampa: "FL",
  "college station": "TX", "san antonio": "TX", "fort worth": "TX", columbus: "OH",
  cleveland: "OH", pittsburgh: "PA", baltimore: "MD", louisville: "KY", indianapolis: "IN",
  milwaukee: "WI", "kansas city": "MO", "st. louis": "MO", raleigh: "NC",
};

/** Best guess at a show's state: the venue's own, else from its city. */
export function showStateKey(venue: { city: string; state?: string | null }): string {
  return stateKey(venue.state) || stateKey(CITY_STATE[cityKey(venue.city)]);
}
