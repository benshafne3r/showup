import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { clearCheckpoints, onCheckpoint, SimulatedCrash } from "@/server/checkpoints";
import { reviewContent } from "@/server/services/content";
import { payoutCreatorPayment } from "@/server/services/payments";
import { recoverPaymentOperations } from "@/server/services/payment-recovery";
import { cancelBooking } from "@/server/services/bookings";
import { db, expireLeases, SYSTEM } from "./fixtures";

/**
 * Labels pay for creator content: approving charges the label's card, and the
 * creator's payout draws on that charge. A declined card approves nothing,
 * crashes and double-clicks never charge twice, and a canceled payment is
 * refunded.
 */

afterEach(() => clearCheckpoints());

async function label() {
  const { data: owner } = await db.from("users").select("id").eq("email", "label.owner@demo.showup.test").single();
  const { data: member } = await db.from("company_members").select("company_id").eq("user_id", owner!.id).single();
  return { ownerId: owner!.id, companyId: member!.company_id, reviewer: { id: owner!.id, role: "label" } };
}

/** An attended booking with a $50 content fee and content waiting for review. */
async function contentToReview() {
  const { ownerId, companyId, reviewer } = await label();
  const { data: mia } = await db.from("users").select("id").eq("email", "creator.mia@demo.showup.test").single();
  const { data: artist } = await db.from("artists").select("id").eq("company_id", companyId).limit(1).single();
  const { data: venue } = await db.from("venues").select("id").limit(1).single();
  const date = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const showId = randomUUID();
  const oppId = randomUUID();
  const requestId = randomUUID();
  const bookingId = randomUUID();
  const ok = (r: { error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message);
  };
  ok(await db.from("shows").insert({ id: showId, company_id: companyId, artist_id: artist!.id, venue_id: venue!.id, date, status: "published" }));
  ok(
    await db.from("show_opportunities").insert({
      id: oppId,
      show_id: showId,
      company_id: companyId,
      stated_ticket_value_cents: 1000,
      deposit_percentage: 100,
      creator_payment_cents: 5000,
      tickets_total: 5,
      tickets_claimed: 1,
      application_deadline: now,
      published_at: now,
      city_alerts_sent_at: now,
    }),
  );
  ok(
    await db.from("show_requests").insert({
      id: requestId,
      opportunity_id: oppId,
      show_id: showId,
      company_id: companyId,
      creator_id: mia!.id,
      status: "approved",
      ticket_count: 1,
      includes_plus_one: false,
    }),
  );
  ok(
    await db.from("bookings").insert({
      id: bookingId,
      request_id: requestId,
      opportunity_id: oppId,
      show_id: showId,
      company_id: companyId,
      creator_id: mia!.id,
      status: "attended",
      stated_ticket_value_cents: 1000,
      deposit_percentage: 100,
      authorization_amount_cents: 1000,
      creator_payment_cents: 5000,
      ticket_count: 1,
      includes_plus_one: false,
      content_required: true,
      content_state: "submitted",
      attendance_state: "approved",
      acceptance_deadline_at: now,
      accepted_at: now,
    }),
  );
  const { data: record } = await db
    .from("creator_payment_records")
    .insert({ booking_id: bookingId, creator_id: mia!.id, company_id: companyId, status: "pending_fulfillment", amount_cents: 5000, provider: "mock" })
    .select("id")
    .single();
  const { data: submission } = await db
    .from("content_submissions")
    .insert({ booking_id: bookingId, creator_id: mia!.id, company_id: companyId, status: "submitted", post_url: "https://www.tiktok.com/@mia/video/1" })
    .select("id")
    .single();
  const approve = () =>
    reviewContent({ bookingId, submissionId: submission!.id, reviewer, companyId, decision: "approved" });
  return { bookingId, recordId: record!.id, submissionId: submission!.id, companyId, ownerId, approve };
}

const record = async (id: string) =>
  (
    await db
      .from("creator_payment_records")
      .select("status, funding_status, funding_charge_id, funding_failure, refunded_at")
      .eq("id", id)
      .single()
  ).data!;

/** Label charges the mock provider made for a payment record. */
async function charges(recordId: string) {
  const { data } = await db.from("mock_payment_state").select("id, state").eq("kind", "intent").eq("state->>paymentRecordId", recordId);
  return (data ?? []).map((r) => ({ id: r.id, ...(r.state as { status: string; amountCents: number }) }));
}

async function transfers(recordId: string) {
  const { data } = await db.from("mock_payment_state").select("state").eq("kind", "transfer").like("state->>idempotencyKey", `payout:${recordId}:%`);
  return (data ?? []).map((r) => r.state as { sourceChargeId: string | null });
}

/** Swap the label's default card for one that declines (or remove it), restoring it after. */
async function withLabelCard(companyId: string, card: "declining" | "none", fn: () => Promise<void>) {
  const { data: good } = await db.from("payment_methods").select("id").eq("company_id", companyId).eq("is_default", true).single();
  await db.from("payment_methods").update({ is_default: false }).eq("id", good!.id);
  let badId: string | null = null;
  if (card === "declining") {
    const providerId = `pm_mock_decline_${randomUUID()}`;
    await db.from("mock_payment_state").insert({ id: providerId, kind: "payment_method", state: { declineAtAuthorize: true } });
    const { ownerId } = await label();
    const { data } = await db
      .from("payment_methods")
      .insert({ user_id: ownerId, company_id: companyId, provider: "mock", provider_method_id: providerId, brand: "visa", last4: "9995", exp_month: 12, exp_year: 2030, verified_at: new Date().toISOString(), is_default: true })
      .select("id")
      .single();
    badId = data!.id;
  }
  try {
    await fn();
  } finally {
    if (badId) await db.from("payment_methods").update({ is_default: false }).eq("id", badId);
    await db.from("payment_methods").update({ is_default: true }).eq("id", good!.id);
  }
}

describe("label pays for content on approval", () => {
  it("charges the label once and pays the creator from that charge", async () => {
    const c = await contentToReview();
    const result = await c.approve();
    expect(result).toMatchObject({ ok: true, paid: true, chargedCents: 5181 }); // $50 + card processing
    const r = await record(c.recordId);
    expect(r).toMatchObject({ status: "paid", funding_status: "charged" });
    const made = await charges(c.recordId);
    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({ status: "captured", amountCents: 5181 });
    expect((await transfers(c.recordId))[0].sourceChargeId).toBe(r.funding_charge_id);
  });

  it("approves nothing when the label's card is declined, then works once the card is fixed", async () => {
    const c = await contentToReview();
    await withLabelCard(c.companyId, "declining", async () => {
      const result = await c.approve();
      expect(result.ok).toBe(false);
      expect((result as { error: string }).error).toMatch(/declined/);
    });
    const { data: sub } = await db.from("content_submissions").select("status").eq("id", c.submissionId).single();
    expect(sub!.status).toBe("submitted"); // still waiting for review, not half-approved
    expect(await record(c.recordId)).toMatchObject({ status: "pending_fulfillment", funding_status: "failed" });
    expect(await transfers(c.recordId)).toHaveLength(0);

    // Good card back: approving again charges it and pays the creator.
    expect(await c.approve()).toMatchObject({ ok: true, paid: true });
    expect((await charges(c.recordId)).filter((x) => x.status === "captured")).toHaveLength(1);
    expect(await record(c.recordId)).toMatchObject({ status: "paid", funding_status: "charged" });
  });

  it("asks for a card when the label has none", async () => {
    const c = await contentToReview();
    await withLabelCard(c.companyId, "none", async () => {
      const result = await c.approve();
      expect(result.ok).toBe(false);
      expect((result as { error: string }).error).toMatch(/Add a card/);
    });
    expect(await record(c.recordId)).toMatchObject({ status: "pending_fulfillment", funding_status: "unfunded" });
    expect(await charges(c.recordId)).toHaveLength(0);
  });

  it("charges once when the label double-clicks approve", async () => {
    const c = await contentToReview();
    const results = await Promise.all([c.approve(), c.approve()]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await charges(c.recordId)).toHaveLength(1);
    expect(await transfers(c.recordId)).toHaveLength(1);
  });

  it("never pays out content the label hasn't paid for", async () => {
    const c = await contentToReview();
    await db.from("creator_payment_records").update({ status: "ready" }).eq("id", c.recordId);
    const result = await payoutCreatorPayment(c.bookingId, SYSTEM);
    expect(result.ok).toBe(false);
    const { data: claimed } = await db.rpc("claim_payout", { p_booking_id: c.bookingId });
    expect(claimed ?? []).toHaveLength(0); // the database refuses too
    expect(await transfers(c.recordId)).toHaveLength(0);
  });
});

describe("crashes around the label charge", () => {
  it("recovers a crash right after the card was charged, without charging again", async () => {
    const c = await contentToReview();
    onCheckpoint("funding.after_provider", () => {
      throw new SimulatedCrash("funding.after_provider");
    });
    await expect(c.approve()).rejects.toThrow(SimulatedCrash);
    clearCheckpoints();
    expect((await record(c.recordId)).funding_status).toBe("charging");

    await expireLeases();
    await recoverPaymentOperations();
    expect((await record(c.recordId)).funding_status).toBe("charged");

    // The label approves again: nothing new is charged, the creator is paid.
    expect(await c.approve()).toMatchObject({ ok: true, paid: true, chargedCents: 0 });
    expect(await charges(c.recordId)).toHaveLength(1);
    expect((await record(c.recordId)).status).toBe("paid");
  });

  it("replays a charge that never reached the provider with the same key, charging once", async () => {
    const c = await contentToReview();
    onCheckpoint("funding.before_provider", () => {
      throw new SimulatedCrash("funding.before_provider");
    });
    await expect(c.approve()).rejects.toThrow(SimulatedCrash);
    clearCheckpoints();
    expect(await charges(c.recordId)).toHaveLength(0);

    await expireLeases();
    await recoverPaymentOperations();
    await recoverPaymentOperations();
    expect((await record(c.recordId)).funding_status).toBe("charged");
    expect(await charges(c.recordId)).toHaveLength(1);
  });
});

describe("refunds", () => {
  it("refunds the label once when a paid-for creator payment is canceled", async () => {
    const c = await contentToReview();
    // Charged, then the process died before the approval was recorded.
    onCheckpoint("funding.after_provider", () => {
      throw new SimulatedCrash("funding.after_provider");
    });
    await expect(c.approve()).rejects.toThrow(SimulatedCrash);
    clearCheckpoints();
    await expireLeases();
    await recoverPaymentOperations();
    expect((await record(c.recordId)).funding_status).toBe("charged");

    // The booking is canceled instead: the sweep refunds the label, once.
    await db.from("bookings").update({ status: "confirmed" }).eq("id", c.bookingId);
    expect((await cancelBooking({ bookingId: c.bookingId, actor: { id: null, role: "system" }, reason: "test" })).ok).toBe(true);
    await recoverPaymentOperations();
    await recoverPaymentOperations();
    const r = await record(c.recordId);
    expect(r).toMatchObject({ status: "canceled", funding_status: "refunded" });
    expect(r.refunded_at).not.toBeNull();
    expect((await charges(c.recordId))[0].status).toBe("refunded");
    const { count } = await db
      .from("payment_operations")
      .select("id", { count: "exact", head: true })
      .eq("kind", "refund")
      .eq("payment_record_id", c.recordId);
    expect(count).toBe(1);
  });
});
