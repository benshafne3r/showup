import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { drainJobs } from "@/server/jobs/queue";
import { db } from "./fixtures";

/**
 * Scheduling guarantees: overlapping scheduler runs don't duplicate work,
 * capped batches can't starve later records, and a worker dying mid-batch
 * loses nothing.
 */

/** `n` confirmed bookings for Mia on shows tomorrow (each due a "show is tomorrow" reminder). */
async function bookingsForTomorrow(n: number) {
  const { data: mia } = await db.from("users").select("id").eq("email", "creator.mia@demo.showup.test").single();
  const { data: owner } = await db.from("users").select("id").eq("email", "label.owner@demo.showup.test").single();
  const { data: member } = await db.from("company_members").select("company_id").eq("user_id", owner!.id).single();
  const companyId = member!.company_id;
  const { data: artist } = await db.from("artists").select("id").eq("company_id", companyId).limit(1).single();
  const { data: venue } = await db.from("venues").select("id").limit(1).single();
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  const showIds = Array.from({ length: n }, () => randomUUID());
  const oppIds = Array.from({ length: n }, () => randomUUID());
  const requestIds = Array.from({ length: n }, () => randomUUID());
  const bookingIds = Array.from({ length: n }, () => randomUUID());
  const now = new Date().toISOString();
  const check = (r: { error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message);
  };
  check(await db.from("shows").insert(showIds.map((id) => ({ id, company_id: companyId, artist_id: artist!.id, venue_id: venue!.id, date: tomorrow, status: "published" as const }))));
  check(
    await db.from("show_opportunities").insert(
      oppIds.map((id, i) => ({
        id,
        show_id: showIds[i],
        company_id: companyId,
        stated_ticket_value_cents: 1000,
        deposit_percentage: 100,
        tickets_total: 5,
        tickets_claimed: 1,
        application_deadline: now,
        published_at: now,
        city_alerts_sent_at: now,
      })),
    ),
  );
  check(
    await db.from("show_requests").insert(
      requestIds.map((id, i) => ({ id, opportunity_id: oppIds[i], show_id: showIds[i], company_id: companyId, creator_id: mia!.id, status: "approved" as const, ticket_count: 1, includes_plus_one: false })),
    ),
  );
  check(
    await db.from("bookings").insert(
      bookingIds.map((id, i) => ({
        id,
        request_id: requestIds[i],
        opportunity_id: oppIds[i],
        show_id: showIds[i],
        company_id: companyId,
        creator_id: mia!.id,
        status: "confirmed" as const,
        stated_ticket_value_cents: 1000,
        deposit_percentage: 100,
        authorization_amount_cents: 1000,
        creator_payment_cents: 0,
        ticket_count: 1,
        includes_plus_one: false,
        content_required: false,
        content_state: "not_required" as const,
        attendance_state: "not_started" as const,
        acceptance_deadline_at: now,
        accepted_at: now,
      })),
    ),
  );
  return bookingIds;
}

async function reminded(bookingIds: string[]) {
  let total = 0;
  for (let i = 0; i < bookingIds.length; i += 100) {
    const links = bookingIds.slice(i, i + 100).map((id) => `/creator/bookings/${id}`);
    const { count } = await db
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("type", "upcoming_show_reminder")
      .in("link", links);
    total += count ?? 0;
  }
  return total;
}

async function remindJobs(bookingIds: string[]) {
  let total = 0;
  for (let i = 0; i < bookingIds.length; i += 100) {
    const { count } = await db
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .in("dedupe_key", bookingIds.slice(i, i + 100).map((id) => `remind_show:${id}`));
    total += count ?? 0;
  }
  return total;
}

describe("scheduler", () => {
  it("reaches every due record even with a small batch cap (no starvation)", async () => {
    const ids = await bookingsForTomorrow(250);
    // Three capped runs: each must pick NEW records, not the ones already enqueued.
    for (let run = 0; run < 3; run++) {
      await db.rpc("schedule_due_jobs", { p_limit: 100 });
      await drainJobs({ budgetMs: 60_000, batch: 50 });
    }
    expect(await remindJobs(ids)).toBe(250);
    expect(await reminded(ids)).toBe(250);
  });

  it("doesn't duplicate work when scheduler runs overlap", async () => {
    const ids = await bookingsForTomorrow(40);
    await Promise.all([
      db.rpc("schedule_due_jobs", { p_limit: 500 }),
      db.rpc("schedule_due_jobs", { p_limit: 500 }),
      db.rpc("schedule_due_jobs", { p_limit: 500 }),
    ]);
    expect(await remindJobs(ids)).toBe(40);
    await Promise.all([drainJobs({ budgetMs: 30_000, worker: "a" }), drainJobs({ budgetMs: 30_000, worker: "b" })]);
    expect(await reminded(ids)).toBe(40);
  });

  it("loses nothing when a worker dies mid-batch", async () => {
    const ids = await bookingsForTomorrow(20);
    await db.rpc("schedule_due_jobs", { p_limit: 500 });
    // Worker A claims the batch and dies without running or completing anything.
    const { data: claimed } = await db.rpc("claim_jobs", { p_worker: "dead-worker", p_limit: 50, p_kinds: ["remind_show"] });
    expect((claimed ?? []).length).toBeGreaterThanOrEqual(20);
    await db.from("jobs").update({ lease_until: new Date(Date.now() - 60_000).toISOString() }).eq("locked_by", "dead-worker");
    // Worker B takes over once the lease lapses.
    await drainJobs({ budgetMs: 30_000, worker: "rescuer" });
    expect(await reminded(ids)).toBe(20);
    const { count: stuck } = await db.from("jobs").select("id", { count: "exact", head: true }).eq("locked_by", "dead-worker").eq("status", "running");
    expect(stuck).toBe(0);
  });
});
