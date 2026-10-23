/**
 * All monetary values in ShowUp are integer cents (USD).
 * This module is the single source of truth for the deposit calculation.
 */

/**
 * Temporary authorization (hold) amount:
 *   stated ticket value × number of tickets × deposit percentage
 *
 * The hold applies to every requested ticket, including a +1.
 * Example: $100.00 ticket × 2 tickets × 50% → $100.00 hold (10000 cents).
 */
/**
 * The deposit for a single ticket. Labels now set this directly (stored as the
 * stated value at 100%); older opportunities still derive it from value × %.
 */
export function depositPerTicketCents(
  statedTicketValueCents: number,
  depositPercentage: number,
): number {
  return authorizationAmountCents(statedTicketValueCents, 1, depositPercentage);
}

export function authorizationAmountCents(
  statedTicketValueCents: number,
  ticketCount: number,
  depositPercentage: number,
): number {
  if (!Number.isInteger(statedTicketValueCents) || statedTicketValueCents < 0) {
    throw new Error("statedTicketValueCents must be a non-negative integer");
  }
  if (!Number.isInteger(ticketCount) || ticketCount < 1) {
    throw new Error("ticketCount must be a positive integer");
  }
  if (
    !Number.isInteger(depositPercentage) ||
    depositPercentage < 0 ||
    depositPercentage > 100
  ) {
    throw new Error("depositPercentage must be an integer between 0 and 100");
  }
  return Math.round((statedTicketValueCents * ticketCount * depositPercentage) / 100);
}

/**
 * Card processing on a label's content charge (Stripe's standard US rate).
 * The label pays it on top of the creator's fee (Ben, 2026-10-23).
 */
export const CARD_FEE_BASIS_POINTS = 290; // 2.9%
export const CARD_FEE_FIXED_CENTS = 30;

/**
 * What a label's card is charged for a creator's content fee: the fee plus
 * card processing, grossed up so that after Stripe takes 2.9% + 30¢ of the
 * whole charge the full creator fee is left.
 * Example: $50.00 → $51.81.
 */
export function labelChargeCents(contentFeeCents: number): number {
  if (!Number.isInteger(contentFeeCents) || contentFeeCents < 0) {
    throw new Error("contentFeeCents must be a non-negative integer");
  }
  if (contentFeeCents === 0) return 0;
  return Math.ceil(((contentFeeCents + CARD_FEE_FIXED_CENTS) * 10_000) / (10_000 - CARD_FEE_BASIS_POINTS));
}

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

const usdWhole = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** 12345 → "$123.45" */
export function formatCents(cents: number): string {
  return usd.format(cents / 100);
}

/** 12300 → "$123" ; 12345 → "$123.45" (used on cards where whole dollars are common) */
export function formatCentsCompact(cents: number): string {
  return cents % 100 === 0 ? usdWhole.format(cents / 100) : usd.format(cents / 100);
}

/** "123.45" → 12345. Throws on invalid or negative input. */
export function parseDollarsToCents(input: string): number {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new Error(`Invalid dollar amount: ${input}`);
  }
  const [dollars, fraction = ""] = cleaned.split(".");
  return parseInt(dollars, 10) * 100 + parseInt(fraction.padEnd(2, "0") || "0", 10);
}
