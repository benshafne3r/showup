import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { clearCheckpoints, onCheckpoint, SimulatedCrash } from "@/server/checkpoints";
import { placeAuthorization } from "@/server/services/payments";
import { receiveWebhookEvent, retryUnfinishedWebhooks } from "@/server/services/webhooks";
import { bookingWithHold, db, expireLeases, hold, providerIntents } from "./fixtures";

/**
 * Providers deliver webhooks more than once, late, and out of order, and our
 * process can die mid-processing. Each test checks the event ends up applied
 * exactly once and state only moves forward.
 */

afterEach(() => clearCheckpoints());

const event = (type: string, data: Record<string, unknown>) => ({ id: `evt_test_${randomUUID()}`, type, data });

async function eventRow(id: string) {
  const { data } = await db.from("webhook_events").select("status, attempts, last_error").eq("id", id).single();
  return data!;
}

describe("webhook processing", () => {
  it("processes a duplicate delivery once", async () => {
    const e = event("payment_intent.created", { id: "pi_unrelated" });
    expect(await receiveWebhookEvent(e)).toEqual({ processed: true, duplicate: false });
    expect(await receiveWebhookEvent(e)).toEqual({ processed: false, duplicate: true });
    expect((await eventRow(e.id)).attempts).toBe(1);
  });

  it("retries an event that failed right after it was stored, on redelivery", async () => {
    const e = event("payment_intent.created", { id: "pi_unrelated" });
    onCheckpoint("webhook.after_claim", () => {
      throw new SimulatedCrash("webhook.after_claim");
    });
    await expect(receiveWebhookEvent(e)).rejects.toThrow(SimulatedCrash);
    expect((await eventRow(e.id)).status).toBe("failed");

    clearCheckpoints();
    expect(await receiveWebhookEvent(e)).toEqual({ processed: true, duplicate: false });
    expect((await eventRow(e.id)).status).toBe("processed");
  });

  it("reprocesses an event abandoned mid-processing (process died), via the retry job", async () => {
    const e = event("payment_intent.created", { id: "pi_unrelated" });
    await db.from("webhook_events").insert({ id: e.id, provider: "mock", type: e.type, payload: e.data as never, status: "processing" });
    await expireLeases();
    const { retried } = await retryUnfinishedWebhooks();
    expect(retried).toBeGreaterThanOrEqual(1);
    expect((await eventRow(e.id)).status).toBe("processed");
  });

  it("never moves a hold backwards when events arrive out of order", async () => {
    const b = await bookingWithHold(1);
    expect((await placeAuthorization(b.authId)).ok).toBe(true);
    const { provider_intent_id: intentId } = await hold(b.authId);

    // The hold expires at the provider; then a stale "authorized" event lands late.
    await receiveWebhookEvent(event("payment_intent.canceled", { id: intentId, cancellation_reason: "automatic" }));
    expect((await hold(b.authId)).status).toBe("expired");
    await receiveWebhookEvent(event("payment_intent.amount_capturable_updated", { id: intentId, metadata: {} }));
    expect((await hold(b.authId)).status).toBe("expired");
  });

  it("recovers a hold whose id we never saved, from the event's metadata", async () => {
    const b = await bookingWithHold(1);
    onCheckpoint("authorize.after_provider", () => {
      throw new SimulatedCrash("authorize.after_provider");
    });
    await expect(placeAuthorization(b.authId)).rejects.toThrow(SimulatedCrash);
    clearCheckpoints();
    const [intent] = await providerIntents(b.authId);
    const { data: rec } = await db.from("authorization_records").select("idempotency_key").eq("id", b.authId).single();
    expect((await hold(b.authId)).provider_intent_id).toBeNull();
    await expireLeases();

    await receiveWebhookEvent(
      event("payment_intent.amount_capturable_updated", {
        id: intent.id,
        metadata: { authRecordId: b.authId, attemptKey: rec!.idempotency_key },
      }),
    );
    const after = await hold(b.authId);
    expect(after.status).toBe("authorized");
    expect(after.provider_intent_id).toBe(intent.id);
    expect(await providerIntents(b.authId)).toHaveLength(1);
  });

  it("leaves a hold alone while its own operation is still running", async () => {
    const b = await bookingWithHold(1);
    onCheckpoint("authorize.after_provider", async () => {
      // A webhook for this very hold arrives while placement is mid-flight.
      const [intent] = await providerIntents(b.authId);
      const { data: rec } = await db.from("authorization_records").select("idempotency_key").eq("id", b.authId).single();
      await receiveWebhookEvent(
        event("payment_intent.amount_capturable_updated", {
          id: intent.id,
          metadata: { authRecordId: b.authId, attemptKey: rec!.idempotency_key },
        }),
      );
      expect((await hold(b.authId)).status).toBe("pending"); // untouched: lease still live
    });
    expect((await placeAuthorization(b.authId)).ok).toBe(true);
    expect((await hold(b.authId)).status).toBe("authorized");
  });
});
