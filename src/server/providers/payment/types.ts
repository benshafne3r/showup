import "server-only";

/**
 * Provider-agnostic payment interface. UI code never touches a provider;
 * only src/server/services/payments.ts calls these methods.
 *
 * Semantics:
 * - attachPaymentMethod: tokenize + verify a card. Never sees a real PAN in
 *   production (Stripe Elements would tokenize client-side); the mock accepts
 *   a test card number to simulate outcomes.
 * - authorize: place a temporary hold (manual-capture intent). NOT a charge.
 * - release: cancel the hold without charging.
 * - capture: charge some or all of an active hold (no-show penalty).
 * - charge: charge a label's card outright for a creator's content fee.
 * - refund: give a label charge back (the content was never paid out).
 * - payout: send the creator their agreed payment.
 * All mutations accept an idempotencyKey; repeating a call with the same key
 * must return the original outcome, never move money twice.
 */

export type CardInput = {
  cardNumber: string;
  expMonth: number;
  expYear: number;
  cvc: string;
  postalCode?: string;
};

export type PaymentMethodInfo = {
  providerMethodId: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  verified: boolean;
  failureReason?: string;
};

export type AuthorizationResult =
  /** expiresAt: when the hold lapses on its own (null when the provider doesn't say). */
  | { ok: true; providerIntentId: string; expiresAt: string | null }
  | { ok: false; failureReason: string };

export type ReleaseResult =
  | { ok: true }
  | { ok: false; failureReason: string };

export type CaptureResult =
  | { ok: true; capturedCents: number }
  | { ok: false; failureReason: string };

export type ChargeResult =
  /** chargeId: the charge a payout can draw from (Stripe `source_transaction`). */
  | { ok: true; providerIntentId: string; providerChargeId: string | null }
  | { ok: false; failureReason: string; providerIntentId?: string | null };

export type RefundResult =
  | { ok: true; providerRefundId: string | null }
  | { ok: false; failureReason: string };

/** What the provider says happened to a label charge (for crash recovery). */
export type ChargeLookup =
  | { found: false }
  | {
      found: true;
      intentId: string;
      chargeId: string | null;
      state: "succeeded" | "failed" | "processing";
      failureReason: string | null;
    };

export type PayoutResult =
  | { ok: true; providerTransferId: string }
  | { ok: false; failureReason: string };

/** What the provider says actually happened to a hold (for crash recovery). */
export type IntentLookup =
  | { found: false }
  | {
      found: true;
      intentId: string;
      /** requires_capture = hold active; canceled = released or expired; succeeded = captured. */
      state: "requires_capture" | "canceled" | "succeeded" | "failed" | "processing";
      cancellationReason: string | null;
      capturedCents: number;
      expiresAt: string | null;
    };

export type TransferLookup = { found: false } | { found: true; transferId: string };

export type WebhookEvent = {
  id: string;
  type: string;
  data: Record<string, unknown>;
};

export interface PaymentProvider {
  readonly name: "mock" | "stripe";
  /** True when no real money can move (mock, or Stripe test keys). */
  readonly testMode: boolean;

  attachPaymentMethod(userId: string, card: CardInput): Promise<PaymentMethodInfo>;

  /**
   * Attach a card that was tokenized client-side (Stripe Elements → `pm_…`),
   * so a real PAN never reaches the server. This is the PCI-safe production
   * path; `attachPaymentMethod` (raw card) remains for the mock provider.
   */
  attachPaymentMethodToken(userId: string, paymentMethodId: string): Promise<PaymentMethodInfo>;

  authorize(input: {
    providerMethodId: string;
    amountCents: number;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<AuthorizationResult>;

  release(input: { providerIntentId: string; idempotencyKey: string }): Promise<ReleaseResult>;

  /**
   * Find a hold by its id, or (when we never got the id back) by the
   * authorization record + attempt key we put in its metadata.
   */
  lookupIntent(input: {
    providerIntentId?: string | null;
    authRecordId: string;
    attemptKey?: string | null;
  }): Promise<IntentLookup>;

  /** Find a payout transfer for a payment record attempt (transfer group + metadata). */
  lookupTransfer(input: { paymentRecordId: string; attemptKey: string }): Promise<TransferLookup>;

  capture(input: {
    providerIntentId: string;
    amountCents: number;
    idempotencyKey: string;
  }): Promise<CaptureResult>;

  /**
   * Charge a saved card now (no hold). Used for a label's content fee when it
   * approves the content; the creator's payout then draws from this charge.
   */
  charge(input: {
    providerMethodId: string;
    amountCents: number;
    idempotencyKey: string;
    metadata: Record<string, string>;
    /** Groups the charge with the payout transfer made from it. */
    transferGroup?: string;
  }): Promise<ChargeResult>;

  /** Find a label charge by the payment record + attempt key in its metadata. */
  lookupCharge(input: { paymentRecordId: string; attemptKey: string }): Promise<ChargeLookup>;

  /** Refund a label charge in full. Refunding an already refunded charge succeeds. */
  refund(input: { providerIntentId: string; idempotencyKey: string }): Promise<RefundResult>;

  payout(input: {
    creatorUserId: string;
    amountCents: number;
    idempotencyKey: string;
    metadata: Record<string, string>;
    /**
     * Stripe Connect destination account (`acct_…`) to transfer to. Resolved by
     * the service layer from the creator's onboarding status; omitted in mock
     * mode (the mock simulates a payout without a real destination).
     */
    destinationAccountId?: string;
    /** Groups every attempt for one payment record, so recovery can find them. */
    transferGroup?: string;
    /**
     * The label charge that funds this payout. Stripe moves the money when that
     * charge settles, so a payout never depends on ShowUp's own balance.
     */
    sourceChargeId?: string;
  }): Promise<PayoutResult>;

  /** Verify a webhook signature; returns the event or null if invalid. */
  verifyWebhook(rawBody: string, signature: string | null): Promise<WebhookEvent | null>;
}
