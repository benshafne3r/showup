import "server-only";

import Stripe from "stripe";
import { serverEnv } from "@/lib/env";
import type {
  AuthorizationResult,
  CaptureResult,
  CardInput,
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
 *   1. Authorization validity: standard card auths expire after ~7 days;
 *      extended authorizations (up to 31 days) require eligibility and are
 *      network-dependent. Our scheduler places holds inside the window, but
 *      confirm `authorization_window_days` ≤ the real validity period.
 *   2. Reauthorization / incremental authorization support per network.
 *   3. Manual capture flow (`capture_method: "manual"`) and partial capture rules.
 *   4. Card-network restrictions for delayed capture in the events/ticketing MCC.
 *   5. Marketplace payouts: Stripe Connect (Express) — creators must complete
 *      KYC onboarding before `transfers` can be sent; store the connected
 *      account id on the creator profile.
 *   6. Webhook signatures + event types (payment_intent.*, transfer.*).
 *   7. Dispute/refund handling and how it maps to our `disputed` states.
 *
 * MVP guard: this adapter refuses to construct with a non-test key so real
 * money can never move from this codebase until the checklist is done.
 */
export class StripePaymentProvider implements PaymentProvider {
  readonly name = "stripe" as const;
  readonly testMode = true;
  private stripe: Stripe;

  constructor() {
    const key = serverEnv.stripeSecretKey;
    if (!key.startsWith("sk_test_")) {
      throw new Error(
        "StripePaymentProvider requires a sk_test_ sandbox key in this MVP. " +
          "Set PAYMENT_PROVIDER=mock or provide Stripe test credentials.",
      );
    }
    this.stripe = new Stripe(key);
  }

  async attachPaymentMethod(userId: string, card: CardInput): Promise<PaymentMethodInfo> {
    // In production the card is tokenized client-side (Stripe Elements) and
    // this receives a payment-method token instead of raw card data. Test
    // mode accepts Stripe's test tokens mapped from well-known test numbers.
    const testToken = TEST_CARD_TOKENS[card.cardNumber.replace(/\s+/g, "")];
    if (!testToken) {
      return {
        providerMethodId: "",
        brand: "card",
        last4: card.cardNumber.slice(-4),
        expMonth: card.expMonth,
        expYear: card.expYear,
        verified: false,
        failureReason:
          "Stripe test mode only accepts Stripe test card numbers (e.g. 4242 4242 4242 4242).",
      };
    }

    const customer = await this.getOrCreateCustomer(userId);
    try {
      const pm = await this.stripe.paymentMethods.attach(testToken, { customer });
      const cardInfo = pm.card;
      return {
        providerMethodId: pm.id,
        brand: cardInfo?.brand ?? "card",
        last4: cardInfo?.last4 ?? "0000",
        expMonth: cardInfo?.exp_month ?? card.expMonth,
        expYear: cardInfo?.exp_year ?? card.expYear,
        verified: true,
      };
    } catch (err) {
      return {
        providerMethodId: "",
        brand: "card",
        last4: card.cardNumber.slice(-4),
        expMonth: card.expMonth,
        expYear: card.expYear,
        verified: false,
        failureReason: err instanceof Error ? err.message : "Card verification failed",
      };
    }
  }

  private async getOrCreateCustomer(userId: string): Promise<string> {
    const search = await this.stripe.customers.search({
      query: `metadata["showup_user_id"]:"${userId}"`,
    });
    if (search.data[0]) return search.data[0].id;
    const customer = await this.stripe.customers.create({
      metadata: { showup_user_id: userId },
    });
    return customer.id;
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
        },
        { idempotencyKey: input.idempotencyKey },
      );
      if (intent.status === "requires_capture") {
        return { ok: true, providerIntentId: intent.id };
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

  async payout(_input: {
    creatorUserId: string;
    amountCents: number;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<PayoutResult> {
    // Production path: Stripe Connect transfer to the creator's connected
    // account (requires Express onboarding). Not available until creators
    // have connected accounts — return a clear error instead of pretending.
    return {
      ok: false,
      failureReason:
        "Stripe payouts require Connect onboarding (not part of this MVP). " +
        "Use PAYMENT_PROVIDER=mock to exercise payout flows.",
    };
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
