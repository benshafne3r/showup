import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { ACCOUNTS, signIn, signOut } from "./helpers";

config({ path: ".env.local" });

/**
 * Creators who opt into city alerts hear about a new show in their city on
 * the next scheduled-job run; creators elsewhere (or opted out) don't.
 */
test("an opted-in creator is alerted when a label posts a show in their city", async ({ page, request }) => {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data: mia } = await db.from("users").select("id").eq("email", ACCOUNTS.mia).single();
  const { data: jay } = await db.from("users").select("id").eq("email", ACCOUNTS.jay).single();
  // Mia (Los Angeles) opts in from the Discover banner; Jay (New York) stays out.
  await db.from("creator_profiles").update({ new_show_alerts: false }).in("user_id", [mia!.id, jay!.id]);

  await signIn(page, ACCOUNTS.mia);
  await page.getByRole("button", { name: "Turn on alerts" }).click();
  await expect(page.getByRole("button", { name: "Turn on alerts" })).toHaveCount(0);
  await signOut(page);

  const venue = `Alert Hall ${Date.now().toString(36)}`;
  await signIn(page, ACCOUNTS.labelOwner);
  await page.goto("/label/tours");
  await page.getByRole("button", { name: "Create" }).first().click();
  await page.getByRole("tab", { name: "Event" }).click();
  await page.getByLabel("Venue / Address").fill(venue);
  await page.getByRole("textbox", { name: "City" }).fill("Los Angeles");
  await page.getByLabel("Show date").fill("2026-12-20");
  await page.getByLabel("Apply by").fill("2026-12-18");
  await page.getByLabel("Deposit per ticket (USD)").fill("25");
  await page.getByRole("button", { name: "Publish event" }).click();
  await expect(page).toHaveURL(/\/label\/shows\/[0-9a-f-]+\?saved=1/);
  await signOut(page);

  const run = await request.post("/api/cron/run", {
    headers: { "x-cron-secret": process.env.CRON_SECRET! },
  });
  expect(run.ok()).toBeTruthy();
  expect((await run.json()).results.newShowAlertsSent).toBeGreaterThanOrEqual(1);

  const { data: miaAlerts } = await db
    .from("notifications")
    .select("title, link")
    .eq("user_id", mia!.id)
    .eq("type", "new_show_nearby");
  expect(miaAlerts?.some((n) => n.title.includes("Los Angeles"))).toBeTruthy();
  const { count: jayAlerts } = await db
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", jay!.id)
    .eq("type", "new_show_nearby");
  expect(jayAlerts).toBe(0);

  // Running again doesn't announce the same show twice.
  const again = await request.post("/api/cron/run", {
    headers: { "x-cron-secret": process.env.CRON_SECRET! },
  });
  expect((await again.json()).results.newShowsAnnounced).toBe(0);
});
