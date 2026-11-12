import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { clearCheckpoints, onCheckpoint, SimulatedCrash } from "@/server/checkpoints";
import { approveRequest, createRequest } from "@/server/services/requests";
import { acceptBooking, cancelBooking, passOnBooking } from "@/server/services/bookings";
import { placeAuthorization } from "@/server/services/payments";
import { queueOffers, sendOffers, sendQueuedOffers } from "@/server/services/offers";
import { drainJobs, enqueueJobs, runOutboxNow } from "@/server/jobs/queue";
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
const invites = async (oppId: string) =>
  (await db.from("bookings").select("id").eq("opportunity_id", oppId)).data!.length;

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
    expect(await claimed(oppId)).toBe(0); // an invite holds no ticket until accepted
  });

  it("post the label's note in each invite's conversation", async () => {
    const { ownerId, companyId, creators } = await companyAndCreators();
    const { showId, oppId } = await opportunity(companyId, 5);
    const ids = creators.slice(0, 2).map((c) => c.id);
    const result = await sendOffers({ companyId, showId, creatorIds: ids, reviewer: { id: ownerId, role: "label" }, message: "Bring your camera!" });
    expect(result).toMatchObject({ ok: true, sent: 2 });
    const { data: threads } = await db
      .from("message_threads")
      .select("last_message_at, messages(body, sender_id), show_requests!inner(opportunity_id)")
      .eq("show_requests.opportunity_id", oppId);
    expect(threads).toHaveLength(2);
    for (const t of threads!) {
      expect(t.messages).toEqual([{ body: "Bring your camera!", sender_id: ownerId }]);
      expect(t.last_message_at).not.toBeNull();
    }
  });
});

describe("background invites", () => {
  it("queue the batch, send it as a job, and tell the label in-app only (once, even if rerun)", async () => {
    const { ownerId, companyId, creators } = await companyAndCreators();
    const { showId, oppId } = await opportunity(companyId, 5);
    const input = { companyId, showId, creatorIds: creators.slice(0, 2).map((c) => c.id), reviewer: { id: ownerId, role: "label" } };

    const queued = await queueOffers(input);
    if (!queued.ok) throw new Error(queued.error);
    expect(queued.count).toBe(2);
    expect(await invites(oppId)).toBe(0); // nothing sent until the job runs

    await runOutboxNow([queued.key]);
    expect(await invites(oppId)).toBe(2);
    const done = await db.from("notifications").select("title, emailed_at").eq("dedupe_key", `${queued.key}:done`);
    expect(done.data).toEqual([{ title: "Invited 2 creators", emailed_at: null }]);

    // A retry of the same job skips the invited creators and sends no second note.
    await sendQueuedOffers(input, queued.key);
    expect(await invites(oppId)).toBe(2);
    expect((await db.from("notifications").select("id").eq("dedupe_key", `${queued.key}:done`)).data).toHaveLength(1);
  });

  it("are refused up front once every ticket is claimed", async () => {
    const { ownerId, companyId, creators } = await companyAndCreators();
    const { showId, oppId } = await opportunity(companyId, 1);
    await db.from("show_opportunities").update({ tickets_claimed: 1 }).eq("id", oppId);
    const result = await queueOffers({ companyId, showId, creatorIds: creators.slice(0, 2).map((c) => c.id), reviewer: { id: ownerId, role: "label" } });
    expect(result).toEqual({ ok: false, error: "All the tickets for this show are claimed" });
  });
});

describe("first come invites", () => {
  /** Jay and Zoe have verified cards in the seed; Leo doesn't. */
  async function invited(tickets: number) {
    const { ownerId, companyId, creators } = await companyAndCreators();
    const by = (email: string) => creators.find((c) => c.email === email)!.id;
    const [jay, zoe, leo] = [by("creator.jay@demo.showup.test"), by("creator.zoe@demo.showup.test"), by("creator.leo@demo.showup.test")];
    const { showId, oppId } = await opportunity(companyId, tickets);
    const sent = await sendOffers({ companyId, showId, creatorIds: [jay, zoe, leo], reviewer: { id: ownerId, role: "label" } });
    expect(sent).toMatchObject({ ok: true, sent: 3 }); // more invites than tickets is fine
    const { data: rows } = await db.from("bookings").select("id, creator_id").eq("opportunity_id", oppId);
    const booking = (creatorId: string) => rows!.find((r) => r.creator_id === creatorId)!.id;
    return { oppId, jay, zoe, leo, booking };
  }
  const state = async (bookingId: string) =>
    (await db.from("bookings").select("status, cancel_reason, holds_tickets, show_requests(status)").eq("id", bookingId).single()).data!;

  it("give the ticket to whoever accepts first and close the other invites", async () => {
    const { oppId, jay, zoe, leo, booking } = await invited(1);
    expect(await claimed(oppId)).toBe(0);

    expect(await acceptBooking({ creatorId: jay, bookingId: booking(jay), agreedToTerms: true })).toEqual({ ok: true });
    expect(await claimed(oppId)).toBe(1);
    expect(await state(booking(jay))).toMatchObject({ status: "confirmed", holds_tickets: true });

    for (const other of [zoe, leo]) {
      expect(await state(booking(other))).toMatchObject({
        status: "canceled",
        cancel_reason: "All tickets were claimed",
        show_requests: { status: "expired" },
      });
      const { data: note } = await db.from("notifications").select("title").eq("dedupe_key", `booking:${booking(other)}:tickets_gone`);
      expect(note).toHaveLength(1);
    }
    // Zoe tries anyway: the invite is closed.
    const late = await acceptBooking({ creatorId: zoe, bookingId: booking(zoe), agreedToTerms: true });
    expect(late.ok).toBe(false);
    expect(await claimed(oppId)).toBe(1);
  });

  it("never oversell when two invitees race for the last ticket", async () => {
    const { oppId, jay, zoe, booking } = await invited(1);
    const results = await Promise.all([
      acceptBooking({ creatorId: jay, bookingId: booking(jay), agreedToTerms: true }),
      acceptBooking({ creatorId: zoe, bookingId: booking(zoe), agreedToTerms: true }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await claimed(oppId)).toBe(1);
    const statuses = [(await state(booking(jay))).status, (await state(booking(zoe))).status].sort();
    expect(statuses).toEqual(["canceled", "confirmed"]);
  });

  it("leave tickets alone when an invite is passed on, and keep the rest open while tickets remain", async () => {
    const { oppId, jay, zoe, leo, booking } = await invited(2);
    expect(await acceptBooking({ creatorId: jay, bookingId: booking(jay), agreedToTerms: true })).toEqual({ ok: true });
    expect(await claimed(oppId)).toBe(1);
    expect((await state(booking(zoe))).status).toBe("awaiting_acceptance");

    const { data: agency } = await db.from("agencies").select("id, name").limit(1).single();
    await passOnBooking({ bookingId: booking(leo), agency: { agencyId: agency!.id, agencyName: agency!.name, actorId: jay } });
    expect((await state(booking(leo))).status).toBe("canceled");
    expect(await claimed(oppId)).toBe(1); // Leo's invite never held one

    const { data: drift } = await db.rpc("booking_consistency");
    expect((drift ?? []).filter((d) => d.ref === oppId)).toEqual([]);
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

  it("takes turns across companies without idling capacity, and reclaims abandoned jobs", async () => {
    const tag = randomUUID().slice(0, 8);
    const busy = randomUUID();
    const quiet = randomUUID();
    await db.from("jobs").insert([
      ...Array.from({ length: 12 }, (_, i) => ({ kind: `fair_${tag}`, dedupe_key: `${tag}:busy:${i}`, company_id: busy })),
      { kind: `fair_${tag}`, dedupe_key: `${tag}:quiet`, company_id: quiet },
    ]);
    const { data: batch } = await db.rpc("claim_jobs", { p_worker: "w1", p_limit: 8, p_kinds: [`fair_${tag}`] });
    const companies = (batch ?? []).map((j) => j.company_id);
    expect(companies).toContain(quiet); // the quiet company isn't stuck behind 12 busy jobs
    expect(companies).toHaveLength(8); // and the batch still fills up

    // w1 dies holding its jobs; once the lease expires another worker takes them.
    await db.from("jobs").update({ lease_until: new Date(Date.now() - 60_000).toISOString() }).eq("locked_by", "w1").like("dedupe_key", `${tag}:%`);
    const { data: retaken } = await db.rpc("claim_jobs", { p_worker: "w2", p_limit: 8, p_kinds: [`fair_${tag}`] });
    expect((retaken ?? []).length).toBeGreaterThan(0);
    await db.from("jobs").delete().like("dedupe_key", `${tag}:%`);
  });
});
