/** Great-circle distance between two points, in meters (haversine). */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Within this many meters of the venue's pin counts as "at the venue" (arenas are big). */
export const CHECK_IN_RADIUS_M = 350;
/** We give back up to this much of the phone's reported uncertainty. */
export const MAX_ACCURACY_ALLOWANCE_M = 150;
/** A fix vaguer than this (e.g. Wi-Fi/IP only) can't prove anything. */
export const MAX_USABLE_ACCURACY_M = 1500;

export type CheckInVerdict = "at_venue" | "too_far" | "imprecise";

export function locationCheckInVerdict(distanceM: number, accuracyM: number): CheckInVerdict {
  if (!Number.isFinite(accuracyM) || accuracyM > MAX_USABLE_ACCURACY_M) return "imprecise";
  const allowance = Math.min(Math.max(accuracyM, 0), MAX_ACCURACY_ALLOWANCE_M);
  return distanceM <= CHECK_IN_RADIUS_M + allowance ? "at_venue" : "too_far";
}

/** "350 m" / "2.4 mi" for messages. */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  const miles = meters / 1609.344;
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}
