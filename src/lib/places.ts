/** A US city row: [name, state code, population], biggest first. */
export type CityRow = [string, string, number];
export type CitySuggestion = { city: string; state: string };
export type VenueSuggestion = { name: string; city: string; state: string; address: string };

/** Lowercase, no accents or periods, "saint" → "st" ("St. Louis" = "saint louis"). */
function norm(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\bsaint\b/g, "st")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Cities for a type-ahead: names starting with what was typed first, then
 * names with a later word starting with it ("york" → New York), biggest
 * first. "Milwaukee, W" narrows by state.
 */
export function matchCities(rows: CityRow[], query: string, limit = 6): CitySuggestion[] {
  const [cityPart, statePart = ""] = query.split(",");
  const q = norm(cityPart);
  const st = norm(statePart);
  if (q.length < 2) return [];
  const starts: CitySuggestion[] = [];
  const words: CitySuggestion[] = [];
  for (const [city, state] of rows) {
    if (st && !state.toLowerCase().startsWith(st)) continue;
    const name = norm(city);
    if (name.startsWith(q)) starts.push({ city, state });
    else if (words.length < limit && name.includes(` ${q}`)) words.push({ city, state });
    if (starts.length >= limit) break;
  }
  return [...starts, ...words].slice(0, limit);
}
