import { beforeAll, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";

/**
 * Webhook signature verification — the boundary that keeps forged provider
 * events out. Exercises the real MockPaymentProvider verifier.
 */

const SECRET = "test-webhook-secret";

beforeAll(() => {
  process.env.MOCK_WEBHOOK_SECRET = SECRET;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
});

async function makeProvider() {
  const { MockPaymentProvider } = await import("@/server/providers/payment/mock");
  return new MockPaymentProvider();
}

function sign(body: string, secret = SECRET) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

describe("mock provider webhook verification", () => {
  it("accepts a correctly signed event", async () => {
    const provider = await makeProvider();
    const body = JSON.stringify({ id: "evt_1", type: "authorization.succeeded", data: {} });
    const event = await provider.verifyWebhook(body, sign(body));
    expect(event).not.toBeNull();
    expect(event!.id).toBe("evt_1");
    expect(event!.type).toBe("authorization.succeeded");
  });

  it("rejects a missing signature", async () => {
    const provider = await makeProvider();
    const body = JSON.stringify({ id: "evt_2", type: "payout.paid", data: {} });
    expect(await provider.verifyWebhook(body, null)).toBeNull();
  });

  it("rejects a signature made with the wrong secret", async () => {
    const provider = await makeProvider();
    const body = JSON.stringify({ id: "evt_3", type: "payout.paid", data: {} });
    expect(await provider.verifyWebhook(body, sign(body, "wrong-secret"))).toBeNull();
  });

  it("rejects a tampered body", async () => {
    const provider = await makeProvider();
    const body = JSON.stringify({ id: "evt_4", type: "authorization.released", data: {} });
    const signature = sign(body);
    const tampered = body.replace("evt_4", "evt_x");
    expect(await provider.verifyWebhook(tampered, signature)).toBeNull();
  });

  it("rejects invalid JSON even when signed", async () => {
    const provider = await makeProvider();
    const body = "not-json{";
    expect(await provider.verifyWebhook(body, sign(body))).toBeNull();
  });
});
