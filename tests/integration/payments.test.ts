import { afterEach, describe, expect, it } from "vitest";
import { clearCheckpoints, onCheckpoint, SimulatedCrash } from "@/server/checkpoints";
import {
  cancelAuthorizationForBooking,
  captureAuthorization,
  payoutCreatorPayment,
  placeAuthorization,
  releaseAuthorization,
} from "@/server/services/payments";
import { recoverPaymentOperations } from "@/server/services/payment-recovery";
import {
  bookingWithHold,
  db,
  expireLeases,
  hold,
  providerIntents,
  providerTransfers,
  readyPayment,
  SYSTEM,
} from "./fixtures";

/**
 * Crash and concurrency behavior of the money paths. A "crash" is a hook at
 * a checkpoint that throws mid-operation, leaving exactly the state a dead
 * process would; recovery then runs once the lease looks abandoned. The
 * invariant every test checks: our records and the provider agree, and no
 * hold, charge or transfer happens twice.
 */

const crashAt = (name: string) =>
  onCheckpoint(name, () => {
    throw new SimulatedCrash(name);
  });

afterEach(() => clearCheckpoints());

async function placedHold(showInDays: number) {
  const b = await bookingWithHold(showInDays);
  expect((await placeAuthorization(b.authId)).ok).toBe(true);
  return b;
}

describe("placing a hold", () => {
  it("recovers a crash right after the provider placed it, without a second hold", async () => {
    const b = await bookingWithHold(1);
    crashAt("authorize.after_provider");
    await expect(placeAuthorization(b.authId)).rejects.toThrow(SimulatedCrash);
    expect((await hold(b.authId)).status).toBe("pending");
    expect(await providerIntents(b.authId)).toHaveLength(1);

    clearCheckpoints();
    await expireLeases();
    await recoverPaymentOperations();

    const after = await hold(b.authId);
    const intents = await providerIntents(b.authId);
    expect(after.status).toBe("authorized");
    expect(intents).toHaveLength(1);
    expect(after.provider_intent_id).toBe(intents[0].id);
  });

  it("replays a call that never reached the provider with the same key, placing one hold", async () => {
    const b = await bookingWithHold(1);
    crashAt("authorize.before_provider");
    await expect(placeAuthorization(b.authId)).rejects.toThrow(SimulatedCrash);
    expect(await providerIntents(b.authId)).toHaveLength(0);

    clearCheckpoints();
    await expireLeases();
    await recoverPaymentOperations();
    await recoverPaymentOperations(); // a second pass must change nothing
    expect((await hold(b.authId)).status).toBe("authorized");
    expect(await providerIntents(b.authId)).toHaveLength(1);
  });

  it("two workers placing the same hold at once create one hold", async () => {
    const b = await bookingWithHold(1);
    const results = await Promise.all([placeAuthorization(b.authId), placeAuthorization(b.authId)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await providerIntents(b.authId)).toHaveLength(1);
  });

  it("voids the new hold when the booking is canceled while it's being placed", async () => {
    const b = await bookingWithHold(1);
    onCheckpoint("authorize.after_provider", async () => {
      await cancelAuthorizationForBooking(b.bookingId, SYSTEM);
    });
    const result = await placeAuthorization(b.authId);
    expect(result.ok).toBe(false);
    expect((await hold(b.authId)).status).toBe("canceled");
    const intents = await providerIntents(b.authId);
    expect(intents).toHaveLength(1);
    expect(intents[0].status).toBe("released");
  });

  it("voids an orphaned hold when the booking was canceled and the placing worker died", async () => {
    const b = await bookingWithHold(1);
    onCheckpoint("authorize.after_provider", async () => {
      await cancelAuthorizationForBooking(b.bookingId, SYSTEM);
      throw new SimulatedCrash("authorize.after_provider");
    });
    await expect(placeAuthorization(b.authId)).rejects.toThrow(SimulatedCrash);
    expect((await providerIntents(b.authId))[0].status).toBe("authorized"); // live hold, nothing tracking it

    clearCheckpoints();
    await expireLeases();
    await recoverPaymentOperations();
    expect((await hold(b.authId)).status).toBe("canceled");
    expect((await providerIntents(b.authId))[0].status).toBe("released");
  });
});

describe("releasing and charging a hold", () => {
  it("recovers a release that crashed after the provider released it", async () => {
    const b = await placedHold(1);
    crashAt("release.after_provider");
    await expect(releaseAuthorization(b.authId, SYSTEM)).rejects.toThrow(SimulatedCrash);
    expect((await hold(b.authId)).status).toBe("releasing"); // never a false "released"

    clearCheckpoints();
    await expireLeases();
    await recoverPaymentOperations();
    expect((await hold(b.authId)).status).toBe("released");
    expect((await providerIntents(b.authId))[0].status).toBe("released");
  });

  it("finishes a release that crashed before reaching the provider", async () => {
    const b = await placedHold(1);
    crashAt("release.before_provider");
    await expect(releaseAuthorization(b.authId, SYSTEM)).rejects.toThrow(SimulatedCrash);
    expect((await providerIntents(b.authId))[0].status).toBe("authorized");

    clearCheckpoints();
    await expireLeases();
    await recoverPaymentOperations();
    expect((await hold(b.authId)).status).toBe("released");
    expect((await providerIntents(b.authId))[0].status).toBe("released");
  });

  it("recovers a capture that crashed after the provider charged it, charging once", async () => {
    const b = await placedHold(-2);
    crashAt("capture.after_provider");
    await expect(captureAuthorization(b.authId, SYSTEM)).rejects.toThrow(SimulatedCrash);
    expect((await hold(b.authId)).status).toBe("capturing"); // never a false "captured"

    clearCheckpoints();
    await expireLeases();
    await recoverPaymentOperations();
    const after = await hold(b.authId);
    expect(after.status).toBe("captured");
    expect(after.capture_amount_cents).toBe(1000);
    expect((await providerIntents(b.authId))[0].status).toBe("captured");
  });

  it("lets exactly one of a racing release and capture win, and the provider agrees", async () => {
    const b = await placedHold(-2);
    const [released, captured] = await Promise.all([
      releaseAuthorization(b.authId, SYSTEM),
      captureAuthorization(b.authId, SYSTEM),
    ]);
    const final = (await hold(b.authId)).status;
    const provider = (await providerIntents(b.authId))[0].status;
    expect(["released", "captured"]).toContain(final);
    expect(provider).toBe(final);
    expect([released.ok && final === "released", captured.ok && final === "captured"].filter(Boolean)).toHaveLength(1);
  });

  it("refuses to charge before the show is over, or after the hold expired", async () => {
    const upcoming = await placedHold(1);
    const early = await captureAuthorization(upcoming.authId, SYSTEM);
    expect(early).toMatchObject({ ok: false });
    expect((await hold(upcoming.authId)).status).toBe("authorized");

    const past = await placedHold(-3);
    await db.from("authorization_records").update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", past.authId);
    const late = await captureAuthorization(past.authId, SYSTEM);
    expect(late).toMatchObject({ ok: false });
    expect((await providerIntents(past.authId))[0].status).toBe("authorized");
  });
});

describe("paying a creator", () => {
  it("recovers a payout that crashed after the transfer, without paying twice", async () => {
    const b = await bookingWithHold(-5);
    const recordId = await readyPayment(b.bookingId, b.creatorId, b.companyId);
    crashAt("payout.after_provider");
    await expect(payoutCreatorPayment(b.bookingId, SYSTEM)).rejects.toThrow(SimulatedCrash);
    const { data: mid } = await db.from("creator_payment_records").select("status").eq("id", recordId).single();
    expect(mid!.status).toBe("paying"); // never a false "paid"

    clearCheckpoints();
    await expireLeases();
    await recoverPaymentOperations();
    const { data: after } = await db
      .from("creator_payment_records")
      .select("status, provider_transfer_id")
      .eq("id", recordId)
      .single();
    const transfers = await providerTransfers(recordId);
    expect(after!.status).toBe("paid");
    expect(transfers).toHaveLength(1);
    expect(after!.provider_transfer_id).toBe(transfers[0].id);
  });

  it("pays once when two payouts race", async () => {
    const b = await bookingWithHold(-5);
    const recordId = await readyPayment(b.bookingId, b.creatorId, b.companyId);
    const results = await Promise.all([payoutCreatorPayment(b.bookingId, SYSTEM), payoutCreatorPayment(b.bookingId, SYSTEM)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await providerTransfers(recordId)).toHaveLength(1);
  });
});
