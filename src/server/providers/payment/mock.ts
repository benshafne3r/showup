import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { serviceDb } from "@/server/db/service";
import { serverEnv, publicEnv } from "@/lib/env";
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
  status: "authorized" | "released" | "captured" | "failed";
  amountCents: number;
  capturedCents?: number;
  methodId: string;
  idempotencyKey: string;
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
        : { ok: true, providerIntentId: existing.id };
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
      } satisfies IntentState);
      await emitWebhook("authorization.failed", { intentId: id, ...input.metadata });
      return { ok: false, failureReason: "Card was declined" };
    }

    await saveState(id, "intent", {
      status: "authorized",
      amountCents: input.amountCents,
      methodId: input.providerMethodId,
      idempotencyKey: input.idempotencyKey,
    } satisfies IntentState);
    await emitWebhook("authorization.succeeded", { intentId: id, amountCents: input.amountCents, ...input.metadata });
    return { ok: true, providerIntentId: id };
  }

  async release(input: { providerIntentId: string; idempotencyKey: string }): Promise<ReleaseResult> {
    const intent = await loadState<IntentState>(input.providerIntentId);
    if (!intent) return { ok: false, failureReason: "Unknown intent" };
    if (intent.status === "released") return { ok: true }; // idempotent
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

  async payout(input: {
    creatorUserId: string;
    amountCents: number;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<PayoutResult> {
    const existing = await findByIdempotencyKey<{ status: string }>("transfer", input.idempotencyKey);
    if (existing) return { ok: true, providerTransferId: existing.id }; // idempotent

    const id = `tr_mock_${randomUUID()}`;
    await saveState(id, "transfer", {
      status: "paid",
      creatorUserId: input.creatorUserId,
      amountCents: input.amountCents,
      idempotencyKey: input.idempotencyKey,
    });
    await emitWebhook("payout.paid", { transferId: id, amountCents: input.amountCents, ...input.metadata });
    return { ok: true, providerTransferId: id };
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
