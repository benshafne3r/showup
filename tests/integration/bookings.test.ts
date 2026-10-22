import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { clearCheckpoints, onCheckpoint, SimulatedCrash } from "@/server/checkpoints";
import { approveRequest, createRequest } from "@/server/services/requests";
import { cancelBooking } from "@/server/services/bookings";
import { placeAuthorization } from "@/server/services/payments";
import { sendOffers } from "@/server/services/offers";
import { drainJobs, enqueueJobs } from "@/server/jobs/queue";
import { notifyJob } from "@/server/jobs/outbox";
import { bookingWithHold, db, hold, providerIntents } from "./fixtures";

/**
 * Booking/inventory transitions are single transactions with their follow-up
 * work in the job outbox: no overselling under concurrency, no half-done
 * transitions, and no lost follow-ups when the process dies after commit.
 */

afterEach(() => clearCheckpoints());

async function companyAndCreators() {
  const { data: owner } = await db.from("users").select("id").eq("email", "label.owner@demo.showup.test").single();
  const { data: member } = await db.from("company_members").select("company_id").eq("user_id", owner!.id).single();
  const { data: creators } = await db
    .from("users")
    .select("id, email")
    .in("email", ["creator.jay@demo.showup.test", "creator.leo@demo.showup.test", "creator.zoe@demo.showup.test"]);
  return { ownerId: owner!.id, companyId: member!.company_id, creators: creators! };
}

/** A fresh published opportunity with `tickets` seats. */
async function opportunity(companyId: string, tickets: number) {
  const { data: artist } = await db.from("artists").select("id").eq("company_id", companyId).limit(1).single();
  const { data: venue } = await db.from("venues").select("id").limit(1).single();
  const date = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
  const { data: show } = await db
    .from("shows")
    .insert({ company_id: companyId, artist_id: artist!.id, venue_id: venue!.id, date, status: "published" })
    .select("id")
    .single();
  const { data: opp } = await db
    .from("show_opportunities")
    .insert({
      show_id: show!.id,
      company_id: companyId,
      stated_ticket_value_cents: 1000,
      deposit_percentage: 100,
      tickets_total: tickets,
      application_deadline: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  return { showId: show!.id, oppId: opp!.id };
}

const claimed = async (oppId: string) =>
  (await db.from("show_opportunities").select("tickets_claimed").eq("id", oppId).single()).data!.tickets_claimed;

describe("approvals", () => {
  it("never oversells when two approvals race for the last ticket", async () => {
    const { ownerId, companyId, creators } = await companyAndCreators();
    const { oppId } = await opportunity(companyId, 1);
    const requests = [];
    for (const c of creators.slice(0, 2)) {
      const r = await createRequest({ creatorId: c.id, opportunityId: oppId, ticketCount: 1, message: "hi" });
      expect(r.ok).toBe(true);
      requests.push((r as { requestId: string }).requestId);
    }
    const reviewer = { id: ownerId, role: "label" };
    const results = await Promise.all(requests.map((requestId) => approveRequest({ requestId, reviewer, companyId })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await claimed(oppId)).toBe(1);
    const { count } = await db.from("bookings").select("id", { count: "exact", head: true }).eq("opportunity_id", oppId);
    expect(count).toBe(1);
    const loser = requests.find((_, i) => !results[i].ok)!;
    const { data: left } = await db.from("show_requests").select("status").eq("id", loser).single();
    expect(left!.status).toBe("pending"); // untouched, not half-approved
  });

  it("rolls the whole approval back when any step fails (no stranded inventory)", async () => {
    const { ownerId, companyId, creators } = await companyAndCreators();
    const { oppId } = await opportunity(companyId, 3);
    const r = (await createRequest({ creatorId: creators[2].id, opportunityId: oppId, ticketCount: 1, message: "hi" })) as {
      requestId: string;
    };
    // Force the booking insert (a late step) to fail: reuse an existing booking id.
    const { data: existing } = await db.from("bookings").select("id").limit(1).single();
    const { error } = await db.rpc("approve_request_tx", {
      p_request_id: r.requestId,
      p_company_id: companyId,
      p_reviewer: ownerId,
      p_ticket_count: 1,
      p_booking_id: existing!.id,
      p_accept_hours: 24,
      p_jobs: [],
    });
    expect(error).not.toBeNull();
    expect(await claimed(oppId)).toBe(0);
    const { data: req } = await db.from("show_requests").select("status").eq("id", r.requestId).single();
    expect(req!.status).toBe("pending");
  });
});

describe("cancellation", () => {
  it("releases inventory and the hold, even when the process dies right after the cancel commits", async () => {
    const b = await bookingWithHold(5);
    expect((await placeAuthorization(b.authId)).ok).toBe(true);
    const { data: before } = await db.from("bookings").select("opportunity_id").eq("id", b.bookingId).single();
    await db.from("show_opportunities").update({ tickets_claimed: 1 }).eq("id", before!.opportunity_id);

    onCheckpoint("outbox.before_run", () => {
      throw new SimulatedCrash("outbox.before_run");
    });
    await expect(cancelBooking({ bookingId: b.bookingId, actor: { id: null, role: "system" }, reason: "test" })).rejects.toThrow(
      SimulatedCrash,
    );
    clearCheckpoints();

    // The cancel itself committed whole…
    const { data: booking } = await db.from("bookings").select("status").eq("id", b.bookingId).single();
    expect(booking!.status).toBe("canceled");
    expect(await claimed(before!.opportunity_id)).toBe(0);
    // …and the hold release is waiting in the outbox, not lost.
    expect((await hold(b.authId)).status).toBe("authorized");
    await drainJobs({ budgetMs: 10_000 });
    expect((await hold(b.authId)).status).toBe("released");
    expect((await providerIntents(b.authId))[0].status).toBe("released");
  });
});

describe("label invites", () => {
  it("go through the normal request path: thread and ticket records included", async () => {
    const { ownerId, companyId, creators } = await companyAndCreators();
    const { showId, oppId } = await opportunity(companyId, 5);
    const result = await sendOffers({ companyId, showId, creatorIds: [creators[0].id], reviewer: { id: ownerId, role: "label" } });
    expect(result).toMatchObject({ ok: true, sent: 1 });
    const { data: req } = await db
      .from("show_requests")
      .select("id, status, offered_at, request_tickets(id), message_threads(id), bookings(id, status, booking_tickets(id))")
      .eq("opportunity_id", oppId)
      .single();
    expect(req!.status).toBe("approved");
    expect(req!.offered_at).not.toBeNull();
    expect(req!.request_tickets).toHaveLength(1);
    expect(req!.message_threads).not.toBeNull();
    expect(req!.bookings?.status).toBe("awaiting_acceptance");
    expect(req!.bookings?.booking_tickets).toHaveLength(1);
    expect(await claimed(oppId)).toBe(1);
  });
});

describe("job queue", () => {
  it("delivers a notification once even if its job runs twice", async () => {
    const { data: mia } = await db.from("users").select("id").eq("email", "creator.mia@demo.showup.test").single();
    const key = `test:${randomUUID()}`;
    const job = notifyJob(key, { userId: mia!.id, type: "booking_confirmed", title: "Once", body: "only once" });
    await enqueueJobs([job]);
    await drainJobs({ budgetMs: 5_000 });
    // Simulate the worker dying after delivering but before completing: requeue it.
    await db.from("jobs").update({ status: "queued", run_at: new Date(Date.now() - 60_000).toISOString() }).eq("dedupe_key", key);
    await drainJobs({ budgetMs: 5_000 });
    const { count } = await db.from("notifications").select("id", { count: "exact", head: true }).eq("dedupe_key", key);
    expect(count).toBe(1);
  });

  it("retries a failing job with backoff and marks it dead after its last attempt", async () => {
    const key = `test:${randomUUID()}`;
    await db.from("jobs").insert({ kind: "no_such_kind", payload: {}, dedupe_key: key, max_attempts: 2 });
    await drainJobs({ budgetMs: 5_000 });
    let { data: job } = await db.from("jobs").select("status, attempts, run_at").eq("dedupe_key", key).single();
    expect(job!.status).toBe("queued");
    expect(new Date(job!.run_at).getTime()).toBeGreaterThan(Date.now()); // backed off
    await db.from("jobs").update({ run_at: new Date(Date.now() - 60_000).toISOString() }).eq("dedupe_key", key);
    await drainJobs({ budgetMs: 5_000 });
    ({ data: job } = await db.from("jobs").select("status, attempts").eq("dedupe_key", key).single());
    expect(job!.status).toBe("dead");
    expect(job!.attempts).toBe(2);
  });

  it("doesn't let one busy company starve another, and reclaims abandoned jobs", async () => {
    const tag = randomUUID().slice(0, 8);
    const busy = randomUUID();
    const quiet = randomUUID();
    await db.from("jobs").insert([
      ...Array.from({ length: 12 }, (_, i) => ({ kind: `fair_${tag}`, dedupe_key: `${tag}:busy:${i}`, company_id: busy })),
      { kind: `fair_${tag}`, dedupe_key: `${tag}:quiet`, company_id: quiet },
    ]);
    const { data: batch } = await db.rpc("claim_jobs", { p_worker: "w1", p_limit: 8, p_kinds: [`fair_${tag}`] });
    const companies = (batch ?? []).map((j) => j.company_id);
    expect(companies).toContain(quiet);
    expect(companies.filter((c) => c === busy).length).toBeLessThanOrEqual(2);

    // w1 dies holding its jobs; once the lease expires another worker takes them.
    await db.from("jobs").update({ lease_until: new Date(Date.now() - 60_000).toISOString() }).eq("locked_by", "w1").like("dedupe_key", `${tag}:%`);
    const { data: retaken } = await db.rpc("claim_jobs", { p_worker: "w2", p_limit: 8, p_kinds: [`fair_${tag}`] });
    expect((retaken ?? []).length).toBeGreaterThan(0);
    await db.from("jobs").delete().like("dedupe_key", `${tag}:%`);
  });
});
