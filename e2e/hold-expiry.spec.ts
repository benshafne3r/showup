import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { ACCOUNTS, signIn } from "./helpers";
import type { Database } from "../src/lib/database.types";

config({ path: ".env.local" });

/**
 * Card holds expire on their own (Visa after 4 days 18 hours). After a show,
 * the label is asked once to decide on a creator who never checked in; if
 * nobody decides before the hold expires, it lapses and nobody is charged.
 */

const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

test("label gets one no-show reminder, then the unclaimed hold expires without a charge", async ({ page, request }) => {
  const runJobs = async () => {
    const res = await request.post("/api/cron/run", { headers: { "x-cron-secret": process.env.CRON_SECRET! } });
    expect(res.ok()).toBeTruthy();
  };

  // The seeded Moody Center show, moved to two days ago.
  const { data: venue } = await db.from("venues").select("id").eq("name", "Moody Center").single();
  const { data: show } = await db
    .from("shows")
    .select("id, date, company_id, show_opportunities(id)")
    .eq("venue_id", venue!.id)
    .single();
  const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
  await db.from("shows").update({ date: twoDaysAgo }).eq("id", show!.id);

  // Mia (card on file) has a confirmed booking whose hold is due to be placed.
  const { data: mia } = await db.from("users").select("id").eq("email", ACCOUNTS.mia).single();
  const { data: card } = await db.from("payment_methods").select("id").eq("user_id", mia!.id).single();
  const { data: req } = await db
    .from("show_requests")
    .insert({
      opportunity_id: show!.show_opportunities!.id,
      show_id: show!.id,
      company_id: show!.company_id,
      creator_id: mia!.id,
      status: "approved",
      ticket_count: 1,
      includes_plus_one: false,
      message: "e2e hold expiry",
    })
    .select("id")
    .single();
  const now = new Date().toISOString();
  const { data: booking, error } = await db
    .from("bookings")
    .insert({
      request_id: req!.id,
      opportunity_id: show!.show_opportunities!.id,
      show_id: show!.id,
      company_id: show!.company_id,
      creator_id: mia!.id,
      status: "confirmed",
      stated_ticket_value_cents: 1000,
      deposit_percentage: 100,
      authorization_amount_cents: 1000,
      creator_payment_cents: 0,
      ticket_count: 1,
      includes_plus_one: false,
      content_required: false,
      content_state: "not_required",
      attendance_state: "not_started",
      acceptance_deadline_at: now,
      accepted_at: now,
      terms_accepted_at: now,
      terms_version: "e2e",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await db.from("authorization_records").insert({
    booking_id: booking!.id,
    creator_id: mia!.id,
    company_id: show!.company_id,
    payment_method_id: card!.id,
    status: "scheduled",
    amount_cents: 1000,
    provider: "mock",
    scheduled_for: new Date(Date.now() - 60_000).toISOString(),
  });
  const hold = async () =>
    (
      await db
        .from("authorization_records")
        .select("status, expires_at, captured_at")
        .eq("booking_id", booking!.id)
        .single()
    ).data!;
  const reminders = async () =>
    (
      await db
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("type", "no_show_decision_due")
        .eq("link", `/label/bookings/${booking!.id}`)
    ).count;

  try {
    // The job places the hold (recording when it expires) and, since the show
    // is over with no check-in, asks the label to decide.
    await runJobs();
    const placed = await hold();
    expect(placed.status).toBe("authorized");
    expect(new Date(placed.expires_at!).getTime()).toBeGreaterThan(Date.now());
    const firstCount = await reminders();
    expect(firstCount).toBeGreaterThanOrEqual(1);

    await runJobs();
    expect(await reminders()).toBe(firstCount); // only once

    await signIn(page, ACCOUNTS.labelOwner);
    await page.goto(`/label/bookings/${booking!.id}`);
    await expect(page.getByText(/Decide within \d+ hours/)).toBeVisible();

    // Nobody decides; the hold reaches its expiry.
    await db
      .from("authorization_records")
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("booking_id", booking!.id);
    await runJobs();
    const lapsed = await hold();
    expect(lapsed.status).toBe("expired");
    expect(lapsed.captured_at).toBeNull();

    await page.reload();
    await expect(page.getByText("The hold expired before anyone charged it")).toBeVisible();
    await expect(page.getByRole("button", { name: /Charge the/ })).toBeDisabled();
  } finally {
    await db.from("shows").update({ date: show!.date }).eq("id", show!.id);
  }
});
