import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { ACCOUNTS, signIn } from "./helpers";

config({ path: ".env.local" });

const GREEK_THEATRE = { latitude: 34.1197, longitude: -118.2962 };
const HOLLYWOOD_BOWL = { latitude: 34.1122, longitude: -118.3391, accuracy: 15 }; // ~4 km away

test.use({ permissions: ["geolocation"], geolocation: HOLLYWOOD_BOWL });

/**
 * Location check-in: on show day the creator taps "I'm here"; away from the
 * venue it's refused, at the venue attendance is approved and the hold freed.
 */
test("a creator at the venue checks in by location and the hold is released", async ({ page, context }) => {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data: mia } = await db.from("users").select("id").eq("email", ACCOUNTS.mia).single();
  const { data: venue } = await db.from("venues").select("id").eq("name", "The Greek Theatre").single();
  const { data: show } = await db.from("shows").select("id").eq("venue_id", venue!.id).single();
  const { data: booking } = await db
    .from("bookings")
    .select("id")
    .eq("show_id", show!.id)
    .eq("creator_id", mia!.id)
    .single();

  // Make today show day, and give the venue its pin (geocoding is off in tests).
  const today = new Date().toISOString().slice(0, 10);
  await db.from("shows").update({ date: today }).eq("id", show!.id);
  await db.from("venues").update({ latitude: GREEK_THEATRE.latitude, longitude: GREEK_THEATRE.longitude }).eq("id", venue!.id);

  await signIn(page, ACCOUNTS.mia);
  await page.goto(`/creator/bookings/${booking!.id}`);

  // Across town: refused, with the distance.
  await page.getByRole("button", { name: "I'm here" }).click();
  await expect(page.getByText(/You.re about .+ from The Greek Theatre/)).toBeVisible();

  // At the venue: verified instantly.
  await context.setGeolocation({ latitude: 34.1199, longitude: -118.296, accuracy: 20 });
  await page.getByRole("button", { name: "I'm here" }).click();
  await expect(page.getByText("You're checked in. Your hold has been released.")).toBeVisible();
  await expect(page.getByText(/Attendance verified/).first()).toBeVisible();

  const { data: submission } = await db
    .from("attendance_submissions")
    .select("method, status, distance_m")
    .eq("booking_id", booking!.id)
    .single();
  expect(submission?.method).toBe("location");
  expect(submission?.status).toBe("approved");
  expect(submission!.distance_m!).toBeLessThan(100);
  const { data: hold } = await db.from("authorization_records").select("status").eq("booking_id", booking!.id).single();
  expect(["released", "canceled"]).toContain(hold?.status);
});
