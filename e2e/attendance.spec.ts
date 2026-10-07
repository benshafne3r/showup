import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { ACCOUNTS, signIn } from "./helpers";
import type { Database } from "../src/lib/database.types";

config({ path: ".env.local" });

/**
 * Label attendance tools: one-tap "Mark attended", "Mark everyone attended",
 * and the optional 48-hour automatic release of unreviewed check-ins.
 */

const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const today = new Date().toISOString().slice(0, 10);

/** The seeded Illinois State Fairgrounds show, moved to today. */
async function showToday() {
  const { data: venue } = await db.from("venues").select("id").eq("name", "Illinois State Fairgrounds").single();
  const { data: show } = await db
    .from("shows")
    .select("id, company_id, show_opportunities(id, stated_ticket_value_cents, deposit_percentage, creator_payment_cents)")
    .eq("venue_id", venue!.id)
    .single();
  await db.from("shows").update({ date: today }).eq("id", show!.id);
  return show!;
}

/** A confirmed booking for `email` on that show (creates the approved request too). */
async function confirmedBooking(email: string) {
  const show = await showToday();
  const opp = show.show_opportunities!;
  const { data: creator } = await db.from("users").select("id").eq("email", email).single();
  const { data: request } = await db
    .from("show_requests")
    .insert({
      opportunity_id: opp.id,
      show_id: show.id,
      company_id: show.company_id,
      creator_id: creator!.id,
      status: "approved",
      ticket_count: 1,
      includes_plus_one: false,
      message: "e2e",
    })
    .select("id")
    .single();
  const now = new Date().toISOString();
  const { data: booking, error } = await db
    .from("bookings")
    .insert({
      request_id: request!.id,
      opportunity_id: opp.id,
      show_id: show.id,
      company_id: show.company_id,
      creator_id: creator!.id,
      status: "confirmed",
      stated_ticket_value_cents: opp.stated_ticket_value_cents,
      deposit_percentage: opp.deposit_percentage,
      authorization_amount_cents: Math.round((opp.stated_ticket_value_cents * opp.deposit_percentage) / 100),
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
  return { showId: show.id, bookingId: booking!.id, creatorId: creator!.id, companyId: show.company_id };
}

async function attendanceOf(bookingId: string) {
  const { data } = await db.from("bookings").select("attendance_state").eq("id", bookingId).single();
  return data?.attendance_state;
}

test.describe.configure({ mode: "serial" });

test("label marks one creator attended in one tap, then everyone else", async ({ page }) => {
  const mia = await confirmedBooking(ACCOUNTS.mia);
  const leo = await confirmedBooking(ACCOUNTS.leo);

  await signIn(page, ACCOUNTS.labelOwner);
  await page.goto(`/label/shows/${mia.showId}`);

  await page.getByRole("button", { name: "Mark Mia Torres attended" }).click();
  await expect.poll(() => attendanceOf(mia.bookingId)).toBe("approved");
  const { data: sub } = await db.from("attendance_submissions").select("method").eq("booking_id", mia.bookingId).single();
  expect(sub?.method).toBe("label");

  await page.getByRole("button", { name: /Mark everyone attended \(1\)/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Mark attended" }).click();
  await expect.poll(() => attendanceOf(leo.bookingId)).toBe("approved");
  await page.reload();
  await expect(page.getByRole("button", { name: /Mark everyone attended/ })).toHaveCount(0);
});

test("an unreviewed photo check-in releases itself after 48 hours, unless the label turns that off", async ({
  page,
  request,
}) => {
  const runJobs = async () => {
    const res = await request.post("/api/cron/run", { headers: { "x-cron-secret": process.env.CRON_SECRET! } });
    expect(res.ok()).toBeTruthy();
    return (await res.json()).results;
  };
  const staleCheckIn = async (b: { bookingId: string; creatorId: string; companyId: string }) => {
    const longAgo = new Date(Date.now() - 49 * 3_600_000).toISOString();
    await db.from("attendance_submissions").insert({
      booking_id: b.bookingId,
      creator_id: b.creatorId,
      company_id: b.companyId,
      status: "submitted",
      method: "photo",
      proof_paths: [],
      note: "e2e stale check-in",
      created_at: longAgo,
      checked_in_at: longAgo,
    });
    await db.from("bookings").update({ attendance_state: "submitted" }).eq("id", b.bookingId);
  };

  // On (the default): released automatically.
  const jay = await confirmedBooking(ACCOUNTS.jay);
  await staleCheckIn(jay);
  expect((await runJobs()).attendanceAutoReleased).toBeGreaterThanOrEqual(1);
  expect(await attendanceOf(jay.bookingId)).toBe("approved");
  const { data: sub } = await db
    .from("attendance_submissions")
    .select("review_note")
    .eq("booking_id", jay.bookingId)
    .single();
  expect(sub?.review_note).toContain("automatically");

  // The label turns it off in Settings: a stale check-in now waits for review.
  await signIn(page, ACCOUNTS.labelOwner);
  await page.goto("/label/settings");
  await page.getByRole("checkbox").first().click();
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText("Automatic release is off")).toBeVisible();

  const ava = await confirmedBooking(ACCOUNTS.ava);
  await staleCheckIn(ava);
  await runJobs();
  expect(await attendanceOf(ava.bookingId)).toBe("submitted");

  // Restore the default for other runs.
  await db.from("companies").update({ auto_release_attendance: true }).eq("id", jay.companyId);
});
