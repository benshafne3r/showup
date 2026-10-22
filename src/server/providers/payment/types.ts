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
  }): Promise<PayoutResult>;

  /** Verify a webhook signature; returns the event or null if invalid. */
  verifyWebhook(rawBody: string, signature: string | null): Promise<WebhookEvent | null>;
}
