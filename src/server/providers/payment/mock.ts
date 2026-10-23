import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { serviceDb } from "@/server/db/service";
import { serverEnv, publicEnv } from "@/lib/env";
import { fallbackHoldExpiry } from "@/lib/holds";
import type {
  AuthorizationResult,
  CaptureResult,
  CardInput,
  ChargeLookup,
  ChargeResult,
  IntentLookup,
  TransferLookup,
  PaymentMethodInfo,
  PaymentProvider,
  PayoutResult,
  RefundResult,
  ReleaseResult,
  WebhookEvent,
} from "./types";

/**
 * Fully functional in-process payment provider for development and tests.
 * Provider-side objects persist in the `mock_payment_state` table so the
 * whole lifecycle (verify → authorize → release/capture → payout) works
 * end-to-end without moving real money.
 *
 * Test cards (mirroring Stripe test-card conventions):
 * - 4242 4242 4242 4242 → verifies and always authorizes
 * - 4000 0000 0000 0002 → declines at verification
 * - 4000 0000 0000 9995 → verifies, but every authorization attempt fails
 * Anything else that passes a Luhn-ish sanity check verifies + authorizes.
 *
 * After each state change the mock POSTs a signed webhook to our own
 * endpoint so the production webhook code path is exercised in dev/tests.
 */

const DECLINE_AT_VERIFY = "4000000000000002";
const DECLINE_AT_AUTHORIZE = "4000000000009995";

type IntentState = {
  /** expired = the card network let the hold lapse (tests set this). */
  status: "authorized" | "released" | "captured" | "failed" | "expired" | "refunded";
  amountCents: number;
  capturedCents?: number;
  methodId: string;
  idempotencyKey: string;
  authRecordId?: string;
  attemptKey?: string;
  /** Set on label charges (content funding) rather than holds. */
  paymentRecordId?: string;
};

async function saveState(id: string, kind: "payment_method" | "intent" | "transfer", state: Record<string, unknown>) {
  await serviceDb().from("mock_payment_state").upsert({ id, kind, state: state as never });
}

async function loadState<T>(id: string): Promise<T | null> {
  const { data } = await serviceDb()
    .from("mock_payment_state")
    .select("state")
    .eq("id", id)
    .maybeSingle();
  return (data?.state as T) ?? null;
}

async function findByIdempotencyKey<T>(kind: string, key: string): Promise<{ id: string; state: T } | null> {
  const { data } = await serviceDb()
    .from("mock_payment_state")
    .select("id, state")
    .eq("kind", kind)
    .eq("state->>idempotencyKey", key)
    .maybeSingle();
  return data ? { id: data.id, state: data.state as T } : null;
}

function sign(body: string): string {
  return createHmac("sha256", serverEnv.mockWebhookSecret).update(body).digest("hex");
}

/** Fire-and-forget signed webhook to our own endpoint (best effort). */
async function emitWebhook(type: string, data: Record<string, unknown>) {
  const event: WebhookEvent = { id: `evt_mock_${randomUUID()}`, type, data };
  const body = JSON.stringify(event);
  try {
    await fetch(`${publicEnv.appUrl}/api/webhooks/payments`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-mock-signature": sign(body) },
      body,
    });
  } catch {
    // Webhooks are a confirmation channel; primary state changes are synchronous.
  }
}

export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock" as const;
  readonly testMode = true;

  async attachPaymentMethod(userId: string, card: CardInput): Promise<PaymentMethodInfo> {
    const digits = card.cardNumber.replace(/\s+/g, "");
    if (!/^\d{13,19}$/.test(digits)) {
      return {
        providerMethodId: "",
        brand: "card",
        last4: digits.slice(-4) || "0000",
        expMonth: card.expMonth,
        expYear: card.expYear,
        verified: false,
        failureReason: "Invalid card number",
      };
    }
    const now = new Date();
    if (card.expYear < now.getFullYear() ||
        (card.expYear === now.getFullYear() && card.expMonth < now.getMonth() + 1)) {
      return {
        providerMethodId: "",
        brand: "card",
        last4: digits.slice(-4),
        expMonth: card.expMonth,
        expYear: card.expYear,
        verified: false,
        failureReason: "Card is expired",
      };
    }
    if (digits === DECLINE_AT_VERIFY) {
      return {
        providerMethodId: "",
        brand: "visa",
        last4: digits.slice(-4),
        expMonth: card.expMonth,
        expYear: card.expYear,
        verified: false,
        failureReason: "Card was declined",
      };
    }

    const id = `pm_mock_${randomUUID()}`;
    const brand = digits.startsWith("4") ? "visa" : digits.startsWith("5") ? "mastercard" : "card";
    await saveState(id, "payment_method", {
      userId,
      brand,
      last4: digits.slice(-4),
      expMonth: card.expMonth,
      expYear: card.expYear,
      declineAtAuthorize: digits === DECLINE_AT_AUTHORIZE,
    });
    return {
      providerMethodId: id,
      brand,
      last4: digits.slice(-4),
      expMonth: card.expMonth,
      expYear: card.expYear,
      verified: true,
    };
  }

  async attachPaymentMethodToken(userId: string, paymentMethodId: string): Promise<PaymentMethodInfo> {
    // Mock has no client tokenization, so this simulates a saved card from any
    // token. (Real Elements + this token path is only exercised under Stripe.)
    const id = `pm_mock_${randomUUID()}`;
    const info = { brand: "visa", last4: "4242", expMonth: 12, expYear: new Date().getFullYear() + 3 };
    await saveState(id, "payment_method", { userId, token: paymentMethodId, ...info });
    return { providerMethodId: id, ...info, verified: true };
  }

  async authorize(input: {
    providerMethodId: string;
    amountCents: number;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<AuthorizationResult> {
    // Idempotency: same key → same outcome, no double hold.
    const existing = await findByIdempotencyKey<IntentState>("intent", input.idempotencyKey);
    if (existing) {
      return existing.state.status === "failed"
        ? { ok: false, failureReason: "Card was declined" }
        : { ok: true, providerIntentId: existing.id, expiresAt: fallbackHoldExpiry(new Date()).toISOString() };
    }

    const method = await loadState<{ declineAtAuthorize?: boolean }>(input.providerMethodId);
    if (!method) return { ok: false, failureReason: "Unknown payment method" };

    const id = `pi_mock_${randomUUID()}`;
    if (method.declineAtAuthorize) {
      await saveState(id, "intent", {
        status: "failed",
        amountCents: input.amountCents,
        methodId: input.providerMethodId,
        idempotencyKey: input.idempotencyKey,
        authRecordId: input.metadata.authRecordId,
        attemptKey: input.metadata.attemptKey,
      } satisfies IntentState);
      await emitWebhook("authorization.failed", { intentId: id, ...input.metadata });
      return { ok: false, failureReason: "Card was declined" };
    }

    await saveState(id, "intent", {
      status: "authorized",
      amountCents: input.amountCents,
      methodId: input.providerMethodId,
      idempotencyKey: input.idempotencyKey,
      authRecordId: input.metadata.authRecordId,
      attemptKey: input.metadata.attemptKey,
    } satisfies IntentState);
    await emitWebhook("authorization.succeeded", { intentId: id, amountCents: input.amountCents, ...input.metadata });
    return { ok: true, providerIntentId: id, expiresAt: fallbackHoldExpiry(new Date()).toISOString() };
  }

  async release(input: { providerIntentId: string; idempotencyKey: string }): Promise<ReleaseResult> {
    const intent = await loadState<IntentState>(input.providerIntentId);
    if (!intent) return { ok: false, failureReason: "Unknown intent" };
    if (intent.status === "released" || intent.status === "expired") return { ok: true }; // idempotent
    if (intent.status !== "authorized") {
      return { ok: false, failureReason: `Cannot release intent in status ${intent.status}` };
    }
    await saveState(input.providerIntentId, "intent", { ...intent, status: "released" });
    await emitWebhook("authorization.released", { intentId: input.providerIntentId });
    return { ok: true };
  }

  async capture(input: {
    providerIntentId: string;
    amountCents: number;
    idempotencyKey: string;
  }): Promise<CaptureResult> {
    const intent = await loadState<IntentState>(input.providerIntentId);
    if (!intent) return { ok: false, failureReason: "Unknown intent" };
    if (intent.status === "captured") {
      return { ok: true, capturedCents: intent.capturedCents ?? intent.amountCents }; // idempotent
    }
    if (intent.status !== "authorized") {
      return { ok: false, failureReason: `Cannot capture intent in status ${intent.status}` };
    }
    if (input.amountCents > intent.amountCents) {
      return { ok: false, failureReason: "Capture exceeds authorized amount" };
    }
    await saveState(input.providerIntentId, "intent", {
      ...intent,
      status: "captured",
      capturedCents: input.amountCents,
    });
    await emitWebhook("authorization.captured", {
      intentId: input.providerIntentId,
      amountCents: input.amountCents,
    });
    return { ok: true, capturedCents: input.amountCents };
  }

  async charge(input: {
    providerMethodId: string;
    amountCents: number;
    idempotencyKey: string;
    metadata: Record<string, string>;
    transferGroup?: string;
  }): Promise<ChargeResult> {
    // Idempotency: same key → same outcome, never a second charge.
    const existing = await findByIdempotencyKey<IntentState>("intent", input.idempotencyKey);
    if (existing) {
      return existing.state.status === "failed"
        ? { ok: false, failureReason: "Card was declined", providerIntentId: existing.id }
        : { ok: true, providerIntentId: existing.id, providerChargeId: `ch_mock_${existing.id.slice(8)}` };
    }
    const method = await loadState<{ declineAtAuthorize?: boolean }>(input.providerMethodId);
    if (!method) return { ok: false, failureReason: "Unknown payment method" };

    const id = `pi_mock_${randomUUID()}`;
    const declined = !!method.declineAtAuthorize;
    await saveState(id, "intent", {
      status: declined ? "failed" : "captured",
      amountCents: input.amountCents,
      capturedCents: declined ? 0 : input.amountCents,
      methodId: input.providerMethodId,
      idempotencyKey: input.idempotencyKey,
      paymentRecordId: input.metadata.paymentRecordId,
      attemptKey: input.metadata.attemptKey,
    } satisfies IntentState);
    await emitWebhook(declined ? "funding.failed" : "funding.succeeded", { intentId: id, ...input.metadata });
    return declined
      ? { ok: false, failureReason: "Card was declined", providerIntentId: id }
      : { ok: true, providerIntentId: id, providerChargeId: `ch_mock_${id.slice(8)}` };
  }

  async lookupCharge(input: { paymentRecordId: string; attemptKey: string }): Promise<ChargeLookup> {
    const { data } = await serviceDb()
      .from("mock_payment_state")
      .select("id, state")
      .eq("kind", "intent")
      .eq("state->>paymentRecordId", input.paymentRecordId)
      .eq("state->>attemptKey", input.attemptKey)
      .limit(1)
      .maybeSingle();
    if (!data) return { found: false };
    const intent = data.state as IntentState;
    const failed = intent.status === "failed";
    return {
      found: true,
      intentId: data.id,
      chargeId: failed ? null : `ch_mock_${data.id.slice(8)}`,
      state: failed ? "failed" : "succeeded",
      failureReason: failed ? "Card was declined" : null,
    };
  }

  async refund(input: { providerIntentId: string; idempotencyKey: string }): Promise<RefundResult> {
    const intent = await loadState<IntentState>(input.providerIntentId);
    if (!intent) return { ok: false, failureReason: "Unknown payment" };
    if (intent.status === "refunded") return { ok: true, providerRefundId: null }; // idempotent
    if (intent.status !== "captured") return { ok: false, failureReason: `Cannot refund payment in status ${intent.status}` };
    await saveState(input.providerIntentId, "intent", { ...intent, status: "refunded" });
    return { ok: true, providerRefundId: `re_mock_${input.providerIntentId.slice(8)}` };
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
    const existing = await findByIdempotencyKey<{ status: string }>("transfer", input.idempotencyKey);
    if (existing) return { ok: true, providerTransferId: existing.id }; // idempotent

    const id = `tr_mock_${randomUUID()}`;
    await saveState(id, "transfer", {
      status: "paid",
      creatorUserId: input.creatorUserId,
      amountCents: input.amountCents,
      idempotencyKey: input.idempotencyKey,
      sourceChargeId: input.sourceChargeId ?? null,
    });
    await emitWebhook("payout.paid", { transferId: id, amountCents: input.amountCents, ...input.metadata });
    return { ok: true, providerTransferId: id };
  }

  async lookupIntent(input: {
    providerIntentId?: string | null;
    authRecordId: string;
    attemptKey?: string | null;
  }): Promise<IntentLookup> {
    let id = input.providerIntentId ?? null;
    let intent = id ? await loadState<IntentState>(id) : null;
    if (!intent) {
      let query = serviceDb()
        .from("mock_payment_state")
        .select("id, state")
        .eq("kind", "intent")
        .eq("state->>authRecordId", input.authRecordId);
      if (input.attemptKey) query = query.eq("state->>attemptKey", input.attemptKey);
      const { data } = await query.limit(1).maybeSingle();
      if (!data) return { found: false };
      id = data.id;
      intent = data.state as IntentState;
    }
    const state =
      intent.status === "authorized"
        ? "requires_capture"
        : intent.status === "captured"
          ? "succeeded"
          : intent.status === "failed"
            ? "failed"
            : "canceled";
    return {
      found: true,
      intentId: id!,
      state,
      cancellationReason: intent.status === "expired" ? "automatic" : intent.status === "released" ? "requested_by_customer" : null,
      capturedCents: intent.capturedCents ?? 0,
      expiresAt: null,
    };
  }

  async lookupTransfer(input: { paymentRecordId: string; attemptKey: string }): Promise<TransferLookup> {
    const existing = await findByIdempotencyKey<{ status: string }>("transfer", input.attemptKey);
    return existing ? { found: true, transferId: existing.id } : { found: false };
  }

  async verifyWebhook(rawBody: string, signature: string | null): Promise<WebhookEvent | null> {
    if (!signature) return null;
    const expected = sign(rawBody);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
      return JSON.parse(rawBody) as WebhookEvent;
    } catch {
      return null;
    }
  }
}
