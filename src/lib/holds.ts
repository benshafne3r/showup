/**
 * Card-hold timing. Our holds are merchant-initiated (the saved card is
 * charged without the creator present), and Visa only keeps those for
 * 4 days 18 hours; Mastercard, Amex and Discover keep them ~7 days. Stripe
 * reports each hold's real expiry (capture_before); this is the fallback.
 */

const HOUR_MS = 3_600_000;

/** The shortest network validity for our holds (Visa, merchant-initiated). */
export const SHORTEST_HOLD_VALIDITY_MS = (4 * 24 + 18) * HOUR_MS;

/** Holds placed earlier than this before the show could expire before it starts. */
export const MAX_AUTHORIZATION_WINDOW_DAYS = 4;

/** Expiry to record when the provider doesn't report one: assume the shortest window. */
export function fallbackHoldExpiry(authorizedAt: Date): Date {
  return new Date(authorizedAt.getTime() + SHORTEST_HOLD_VALIDITY_MS);
}

/** Whole hours left before `iso` (0 once it has passed). */
export function hoursLeft(iso: string, now = new Date()): number {
  return Math.max(0, Math.floor((new Date(iso).getTime() - now.getTime()) / HOUR_MS));
}
