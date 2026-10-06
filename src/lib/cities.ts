/**
 * Curated list of major live-music markets, shown in the Discover city filter
 * alongside whatever cities currently have published shows. Lets creators pick
 * their city even before an event exists there. Add to this freely.
 */
export const MAJOR_CITIES: string[] = [
  "Atlanta",
  "Austin",
  "Boston",
  "Charlotte",
  "Chicago",
  "Dallas",
  "Denver",
  "Detroit",
  "Houston",
  "Las Vegas",
  "London",
  "Los Angeles",
  "Miami",
  "Minneapolis",
  "Nashville",
  "New Orleans",
  "New York",
  "Newark",
  "Philadelphia",
  "Phoenix",
  "Portland",
  "San Diego",
  "San Francisco",
  "Seattle",
  "Toronto",
  "Washington",
];

const CITY_ALIASES: Record<string, string> = {
  la: "los angeles",
  "l.a.": "los angeles",
  nyc: "new york",
  "new york city": "new york",
  sf: "san francisco",
  atl: "atlanta",
  philly: "philadelphia",
  dc: "washington",
  "washington dc": "washington",
  "washington d.c.": "washington",
  nola: "new orleans",
  vegas: "las vegas",
};

/**
 * Normalize a free-text city for matching ("Los Angeles, CA", " LA " → "los angeles").
 * Creator and venue cities are both typed by hand, so compare these keys.
 */
export function cityKey(city: string): string {
  const base = city.split(",")[0].trim().toLowerCase().replace(/\s+/g, " ");
  return CITY_ALIASES[base] ?? base;
}
