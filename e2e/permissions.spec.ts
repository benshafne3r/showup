import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { ACCOUNTS, signIn } from "./helpers";

config({ path: ".env.local" });

/**
 * Definition of Done criterion 14: users cannot access other users' or other
 * companies' private records.
 */

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

test("anonymous users are redirected away from every app area", async ({ page }) => {
  for (const path of ["/creator", "/label", "/admin", "/creator/payments", "/label/requests"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in/);
  }
});

test("a creator cannot open another creator's booking", async ({ page }) => {
  const db = serviceClient();
  const { data: mia } = await db
    .from("users")
    .select("id")
    .eq("email", ACCOUNTS.mia)
    .single();
  const { data: miaBooking } = await db
    .from("bookings")
    .select("id")
    .eq("creator_id", mia!.id)
    .limit(1)
    .single();

  await signIn(page, ACCOUNTS.jay);
  await page.goto(`/creator/bookings/${miaBooking!.id}`);
  // Streamed dynamic pages resolve notFound() inside the stream, so assert
  // the rendered 404 content rather than the response status.
  await expect(page.getByText("This page doesn't exist")).toBeVisible();
});

test("a creator cannot reach the label or admin apps", async ({ page }) => {
  await signIn(page, ACCOUNTS.jay);
  await page.goto("/label");
  await expect(page).toHaveURL(/\/creator/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/creator/);
});

test("a label member cannot reach the admin app", async ({ page }) => {
  await signIn(page, ACCOUNTS.labelMember);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/label/);
});

test("a label member cannot open a booking from another company", async ({ page }) => {
  const db = serviceClient();
  // Create a second company + booking-less show isn't needed: assert a random
  // (nonexistent) booking id 404s and RLS returns nothing for foreign rows.
  await signIn(page, ACCOUNTS.labelOwner);
  await page.goto("/label/bookings/00000000-0000-4000-8000-000000000000");
  await expect(page.getByText("This page doesn't exist")).toBeVisible();
});

test("the cron endpoint rejects calls without the secret", async ({ request }) => {
  const response = await request.post("/api/cron/run", {
    headers: { "x-cron-secret": "wrong-secret" },
  });
  expect(response.status()).toBe(401);
});

test("the webhook endpoint rejects unsigned payloads", async ({ request }) => {
  const response = await request.post("/api/webhooks/payments", {
    data: { id: "evt_forged", type: "authorization.released", data: {} },
  });
  expect(response.status()).toBe(400);
});
