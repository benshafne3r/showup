/**
 * Helpers for agency rosters imported from CreatorCore pages (follower counts
 * like "4.3M", locations like "Los Angeles, California, United States").
 */

/** "4.3M" → 4300000, "951.7K" → 951700, "1,204" → 1204; 0 when unreadable. */
export function parseFollowerCount(text: string | null | undefined): number {
  const m = (text ?? "").trim().replace(/,/g, "").match(/^([0-9]*\.?[0-9]+)\s*([KMB])?$/i);
  if (!m) return 0;
  const scale = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] ?? "").toUpperCase() as "K" | "M" | "B"] ?? 1;
  return Math.round(Number(m[1]) * scale);
}

export type RosterLocation = { city: string; region: string; country: string };

/**
 * CreatorCore writes "City, State, Country", "State, Country" or "Country".
 * Country is stored as "US" for the United States, like the rest of the app.
 */
export function parseRosterLocation(text: string | null | undefined): RosterLocation {
  const parts = (text ?? "")
    .split(",")
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const country = (c: string | undefined) =>
    !c ? "" : /^(united states|usa|us)$/i.test(c) ? "US" : c;
  if (parts.length >= 3) return { city: parts[0], region: parts[1], country: country(parts[parts.length - 1]) };
  if (parts.length === 2) return { city: "", region: parts[0], country: country(parts[1]) };
  if (parts.length === 1) return { city: "", region: "", country: country(parts[0]) };
  return { city: "", region: "", country: "" };
}

/** "Los Angeles, California" / "Kentucky" / "Spain" for display. */
export function locationLabel(loc: { city?: string | null; region?: string | null; country?: string | null }): string {
  const parts = [loc.city, loc.region].filter((p): p is string => !!p && p.trim() !== "");
  if (parts.length) return parts.join(", ");
  return loc.country && loc.country !== "US" ? loc.country : "";
}

export const compactCount = (n: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
