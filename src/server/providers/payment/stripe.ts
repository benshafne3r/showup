import "server-only";

import Stripe from "stripe";
import { serverEnv } from "@/lib/env";
import type {
  AuthorizationResult,
  CaptureResult,
  CardInput,
  ChargeLookup,
  ChargeResult,
  RefundResult,
  IntentLookup,
  TransferLookup,
  PaymentMethodInfo,
  PaymentProvider,
  PayoutResult,
  ReleaseResult,
  WebhookEvent,
} from "./types";

/**
 * Stripe adapter behind the same interface as the mock provider.
 *
 * ⚠️ PRODUCTION CHECKLIST — verify against current Stripe docs before going live:
 *   1. Authorization validity: our holds are merchant-initiated (off-session),
 *      which Visa keeps only 4 days 18 hours (others ~7 days). Holds are placed
 *      `authorization_window_days` (2) before the show, and each hold's real
 *      expiry (`capture_before`) is stored so lapsed holds are marked expired.
 *   2. Reauthorization / incremental authorization support per network.
 *   3. Manual capture flow (`capture_method: "manual"`) and partial capture rules.
 *   4. Card-network restrictions for delayed capture in the events/ticketing MCC.
 *   5. Marketplace payouts: Stripe Connect (Express) — creators must complete
 *      KYC onboarding before `transfers` can be sent; store the connected
 *      account id on the creator profile.
 *   6. Webhook signatures + event types (payment_intent.*, transfer.*).
 *   7. Dispute/refund handling and how it maps to our `disputed` states.
 *
 * Live-key guard: test keys (`sk_test_`) are always allowed. A live key
 * (`sk_live_`) moves REAL money, so it only starts when `STRIPE_LIVE_OK=true`
 * is explicitly set — a stray live key alone can never turn on real charges.
 */
export class StripePaymentProvider implements PaymentProvider {
  readonly name = "stripe" as const;
  readonly testMode: boolean;
  private stripe: Stripe;

  constructor() {
    const key = serverEnv.stripeSecretKey;
    if (!key.startsWith("sk_")) {
      throw new Error(
        "STRIPE_SECRET_KEY must be a Stripe secret key (sk_test_… or sk_live_…).",
      );
    }
    const isTest = key.startsWith("sk_test_");
    if (!isTest && !serverEnv.stripeLiveOk) {
      throw new Error(
        "Refusing to start with a live Stripe key. Set STRIPE_LIVE_OK=true to " +
          "enable real charges and payouts (see docs/GO_LIVE.md).",
      );
    }
    this.testMode = isTest;
    // Bounded calls: a hung request must finish well inside the 2-minute
    // operation lease. Retries are safe because every mutation carries an
    // idempotency key.
    this.stripe = new Stripe(key, { timeout: 20_000, maxNetworkRetries: 2 });
  }

  async ensureCustomer(userId: string, knownCustomerId: string | null): Promise<string> {
    if (knownCustomerId) return knownCustomerId;
    // Customers made before ids were stored are found by metadata, once.
    const search = await this.stripe.customers.search({ query: `metadata["showup_user_id"]:"${userId}"` });
    if (search.data[0]) return search.data[0].id;
    // The key makes concurrent first saves share one customer.
    const customer = await this.stripe.customers.create(
      { metadata: { showup_user_id: userId } },
      { idempotencyKey: `customer:${userId}` },
    );
    return customer.id;
  }

  async attachPaymentMethod(customerId: string, card: CardInput): Promise<PaymentMethodInfo> {
    // Real cards are saved through startCardSetup (Stripe Elements in the
    // browser). This maps well-known test numbers to Stripe test cards.
    const testToken = TEST_CARD_TOKENS[card.cardNumber.replace(/\s+/g, "")];
    const unverified = (failureReason: string): PaymentMethodInfo => ({
      providerMethodId: "",
      brand: "card",
      last4: card.cardNumber.slice(-4),
      expMonth: card.expMonth,
      expYear: card.expYear,
      verified: false,
      failureReason,
    });
    if (!testToken) {
      return unverified("Stripe test mode only accepts Stripe test card numbers (e.g. 4242 4242 4242 4242).");
    }
    try {
      const pm = await this.stripe.paymentMethods.attach(testToken, { customer: customerId });
      return {
        providerMethodId: pm.id,
        brand: pm.card?.brand ?? "card",
        last4: pm.card?.last4 ?? "0000",
        expMonth: pm.card?.exp_month ?? card.expMonth,
        expYear: pm.card?.exp_year ?? card.expYear,
        verified: true,
      };
    } catch (err) {
      return unverified(err instanceof Error ? err.message : "Card verification failed");
    }
  }

  async startCardSetup(
    customerId: string,
    metadata: Record<string, string>,
  ): Promise<{ setupIntentId: string; clientSecret: string }> {
    const intent = await this.stripe.setupIntents.create({
      customer: customerId,
      usage: "off_session",
      payment_method_types: ["card"],
      metadata,
    });
    if (!intent.client_secret) throw new Error("Stripe returned no client secret for the card setup");
    return { setupIntentId: intent.id, clientSecret: intent.client_secret };
  }

  async finishCardSetup(customerId: string, setupIntentId: string): Promise<PaymentMethodInfo> {
    const unverified = (failureReason: string): PaymentMethodInfo => ({
      providerMethodId: "",
      brand: "card",
      last4: "0000",
      expMonth: 0,
      expYear: 0,
      verified: false,
      failureReason,
    });
    const intent = await this.stripe.setupIntents.retrieve(setupIntentId, { expand: ["payment_method"] });
    const owner = typeof intent.customer === "string" ? intent.customer : intent.customer?.id;
    if (owner !== customerId) return unverified("That card setup doesn't belong to this account.");
    if (intent.status === "requires_action") return unverified("Your bank still needs you to confirm this card.");
    if (intent.status !== "succeeded") {
      return unverified(intent.last_setup_error?.message ?? "The card couldn't be confirmed. Try again or use another card.");
    }
    const pm = typeof intent.payment_method === "object" ? intent.payment_method : null;
    if (!pm?.card) return unverified("The card couldn't be read. Try again.");
    return {
      providerMethodId: pm.id,
      brand: pm.card.brand ?? "card",
      last4: pm.card.last4 ?? "0000",
      expMonth: pm.card.exp_month ?? 0,
      expYear: pm.card.exp_year ?? 0,
      verified: true,
    };
  }

  async authorize(input: {
    providerMethodId: string;
    amountCents: number;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<AuthorizationResult> {
    try {
      const pm = await this.stripe.paymentMethods.retrieve(input.providerMethodId);
      const intent = await this.stripe.paymentIntents.create(
        {
          amount: input.amountCents,
          currency: "usd",
          capture_method: "manual",
          confirm: true,
          payment_method: input.providerMethodId,
          customer: typeof pm.customer === "string" ? pm.customer : undefined,
          off_session: true,
          metadata: input.metadata,
          expand: ["latest_charge"],
        },
        { idempotencyKey: input.idempotencyKey },
      );
      if (intent.status === "requires_capture") {
        const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null;
        const captureBefore = charge?.payment_method_details?.card?.capture_before;
        return {
          ok: true,
          providerIntentId: intent.id,
          expiresAt: captureBefore ? new Date(captureBefore * 1000).toISOString() : null,
        };
      }
      return { ok: false, failureReason: `Unexpected intent status: ${intent.status}` };
    } catch (err) {
      return { ok: false, failureReason: err instanceof Error ? err.message : "Authorization failed" };
    }
  }

  async release(input: { providerIntentId: string; idempotencyKey: string }): Promise<ReleaseResult> {
    try {
      const intent = await this.stripe.paymentIntents.retrieve(input.providerIntentId);
      if (intent.status === "canceled") return { ok: true }; // idempotent
      await this.stripe.paymentIntents.cancel(input.providerIntentId, undefined, {
        idempotencyKey: input.idempotencyKey,
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, failureReason: err instanceof Error ? err.message : "Release failed" };
    }
  }

  async capture(input: {
    providerIntentId: string;
    amountCents: number;
    idempotencyKey: string;
  }): Promise<CaptureResult> {
    try {
      const intent = await this.stripe.paymentIntents.capture(
        input.providerIntentId,
        { amount_to_capture: input.amountCents },
        { idempotencyKey: input.idempotencyKey },
      );
      return { ok: true, capturedCents: intent.amount_received };
    } catch (err) {
      return { ok: false, failureReason: err instanceof Error ? err.message : "Capture failed" };
    }
  }

  async charge(input: {
    providerMethodId: string;
    amountCents: number;
    idempotencyKey: string;
    metadata: Record<string, string>;
    transferGroup?: string;
  }): Promise<ChargeResult> {
    try {
      const pm = await this.stripe.paymentMethods.retrieve(input.providerMethodId);
      const intent = await this.stripe.paymentIntents.create(
        {
          amount: input.amountCents,
          currency: "usd",
          confirm: true,
          payment_method: input.providerMethodId,
          customer: typeof pm.customer === "string" ? pm.customer : undefined,
          off_session: true,
          metadata: input.metadata,
          ...(input.transferGroup ? { transfer_group: input.transferGroup } : {}),
        },
        { idempotencyKey: input.idempotencyKey },
      );
      const chargeId = typeof intent.latest_charge === "string" ? intent.latest_charge : (intent.latest_charge?.id ?? null);
      if (intent.status === "succeeded") return { ok: true, providerIntentId: intent.id, providerChargeId: chargeId };
      return { ok: false, failureReason: `Unexpected payment status: ${intent.status}`, providerIntentId: intent.id };
    } catch (err) {
      // Off-session declines and "authentication required" land here.
      const intentId = (err as { raw?: { payment_intent?: { id?: string } } }).raw?.payment_intent?.id ?? null;
      return { ok: false, failureReason: err instanceof Error ? err.message : "Payment failed", providerIntentId: intentId };
    }
  }

  async lookupCharge(input: { paymentRecordId: string; attemptKey: string }): Promise<ChargeLookup> {
    const found = await this.stripe.paymentIntents.search({
      query: `metadata['paymentRecordId']:'${input.paymentRecordId}'`,
      limit: 20,
    });
    const intent = found.data.find((pi) => pi.metadata?.attemptKey === input.attemptKey);
    if (!intent) return { found: false };
    const chargeId = typeof intent.latest_charge === "string" ? intent.latest_charge : (intent.latest_charge?.id ?? null);
    return {
      found: true,
      intentId: intent.id,
      chargeId,
      state: intent.status === "succeeded" ? "succeeded" : intent.status === "processing" ? "processing" : "failed",
      failureReason: intent.last_payment_error?.message ?? null,
    };
  }

  async refund(input: { providerIntentId: string; idempotencyKey: string }): Promise<RefundResult> {
    try {
      const refund = await this.stripe.refunds.create(
        { payment_intent: input.providerIntentId },
        { idempotencyKey: input.idempotencyKey },
      );
      return { ok: true, providerRefundId: refund.id };
    } catch (err) {
      if ((err as { code?: string }).code === "charge_already_refunded") return { ok: true, providerRefundId: null };
      return { ok: false, failureReason: err instanceof Error ? err.message : "Refund failed" };
    }
  }

  async payout(input: {
    creatorUserId: string;
    amountCents: number;
    idempotencyKey: string;
    metadata: Record<string, string>;
    destinationAccountId?: string;
    transferGroup?: string;
    sourceChargeId?: string;
  }): Promise<PayoutResult> {
    // Connect "separate charges and transfers": move funds from the platform
    // balance to the creator's connected account after content is approved.
    // The service layer only supplies a destination once the creator's
    // transfers capability is active, so a missing id is a real setup gap.
    if (!input.destinationAccountId) {
      return {
        ok: false,
        failureReason: "Creator has not finished payout onboarding (no connected account).",
      };
    }
    try {
      const transfer = await this.stripe.transfers.create(
        {
          amount: input.amountCents,
          currency: "usd",
          destination: input.destinationAccountId,
          metadata: input.metadata,
          ...(input.transferGroup ? { transfer_group: input.transferGroup } : {}),
          ...(input.sourceChargeId ? { source_transaction: input.sourceChargeId } : {}),
        },
        { idempotencyKey: input.idempotencyKey },
      );
      return { ok: true, providerTransferId: transfer.id };
    } catch (err) {
      return { ok: false, failureReason: err instanceof Error ? err.message : "Payout failed" };
    }
  }

  async lookupIntent(input: {
    providerIntentId?: string | null;
    authRecordId: string;
    attemptKey?: string | null;
  }): Promise<IntentLookup> {
    let intent: Stripe.PaymentIntent | null = null;
    if (input.providerIntentId) {
      intent = await this.stripe.paymentIntents.retrieve(input.providerIntentId, { expand: ["latest_charge"] });
    } else {
      // We never got the id back (crash mid-call): find it by our metadata.
      const found = await this.stripe.paymentIntents.search({
        query: `metadata['authRecordId']:'${input.authRecordId}'`,
        limit: 20,
        expand: ["data.latest_charge"],
      });
      intent =
        found.data.find((pi) => !input.attemptKey || pi.metadata?.attemptKey === input.attemptKey) ?? null;
    }
    if (!intent) return { found: false };
    const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null;
    const captureBefore = charge?.payment_method_details?.card?.capture_before;
    const state =
      intent.status === "requires_capture"
        ? "requires_capture"
        : intent.status === "canceled"
          ? "canceled"
          : intent.status === "succeeded"
            ? "succeeded"
            : intent.status === "processing"
              ? "processing"
              : "failed";
    return {
      found: true,
      intentId: intent.id,
      state,
      cancellationReason: intent.cancellation_reason ?? null,
      capturedCents: intent.amount_received ?? 0,
      expiresAt: captureBefore ? new Date(captureBefore * 1000).toISOString() : null,
    };
  }

  async lookupTransfer(input: { paymentRecordId: string; attemptKey: string }): Promise<TransferLookup> {
    const transfers = await this.stripe.transfers.list({ transfer_group: input.paymentRecordId, limit: 20 });
    const match = transfers.data.find((t) => t.metadata?.attemptKey === input.attemptKey && !t.reversed);
    return match ? { found: true, transferId: match.id } : { found: false };
  }

  async verifyWebhook(rawBody: string, signature: string | null): Promise<WebhookEvent | null> {
    if (!signature || !serverEnv.stripeWebhookSecret) return null;
    try {
      const event = await this.stripe.webhooks.constructEventAsync(
        rawBody,
        signature,
        serverEnv.stripeWebhookSecret,
      );
      return {
        id: event.id,
        type: event.type,
        data: event.data.object as unknown as Record<string, unknown>,
      };
    } catch {
      return null;
    }
  }
}

/** Map well-known test card numbers to Stripe test payment-method tokens. */
const TEST_CARD_TOKENS: Record<string, string> = {
  "4242424242424242": "pm_card_visa",
  "4000000000000002": "pm_card_visa_chargeDeclined",
  "5555555555554444": "pm_card_mastercard",
};
