import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ACCOUNTS, signIn } from "./helpers";
import type { Database } from "../src/lib/database.types";

const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

/**
 * Pull tour dates: searching the artist (Spotify; faked in e2e) pulls their
 * announced dates (offline demo provider in e2e); the label picks some, sets
 * terms once and publishes a show per date.
 */
test("label pulls an artist's tour dates from a Spotify search and publishes two", async ({ page }) => {
  await signIn(page, ACCOUNTS.labelOwner);
  await page.goto("/label/shows/import");

  await page.getByLabel("Search Spotify for an artist").fill("Ella Langley");
  await page.getByRole("button", { name: "Ella Langley", exact: true }).click();
  await expect(page.getByText(/\d+ dates from demo/)).toBeVisible();

  await page.getByRole("button", { name: "Deselect all" }).click();
  const dates = page.locator("ul li input[type=checkbox]");
  await dates.nth(0).check();
  await dates.nth(1).check();

  await page.getByLabel("Deposit per ticket (USD)").fill("30");
  await page.getByRole("button", { name: "Publish 2 shows" }).click();
  await expect(page).toHaveURL(/imported=2/);
});

/**
 * From a tour's "Import dates": the tour's artist and the tour come
 * preselected, every date is selected, and content is opt-in.
 */
test("label imports dates straight into a tour, with paid content", async ({ page }) => {
  await signIn(page, ACCOUNTS.labelOwner);
  await page.goto("/label/tours?view=all");

  const tourCard = page.locator("div.rounded-xl").filter({ hasText: "The Dandelion Tour 2026" }).first();
  await tourCard.getByRole("link", { name: "Import dates" }).click();
  await expect(page.getByRole("heading", { name: "Import dates for The Dandelion Tour 2026" })).toBeVisible();
  await expect(page.getByText(/\d+ dates from demo/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Deselect all" })).toBeVisible(); // all preselected
  await expect(page.getByLabel("Add to tour (optional)")).toHaveText("The Dandelion Tour 2026");

  await page.getByRole("button", { name: "Deselect all" }).click();
  const dates = page.locator("ul li input[type=checkbox]");
  await dates.nth(4).check();
  await dates.nth(5).check();
  await page.getByLabel("Deposit per ticket (USD)").fill("30");
  await page.getByLabel("Require content").check();
  await page.getByLabel("Creator payment (USD)").fill("77");
  await page.getByRole("button", { name: "Publish 2 shows" }).click();
  await expect(page).toHaveURL(/imported=2/);

  const { data: tour } = await db.from("tours").select("id").eq("name", "The Dandelion Tour 2026").single();
  const { data: opps } = await db
    .from("show_opportunities")
    .select("creator_payment_cents, deliverable_requirements(platform), shows!inner(tour_id)")
    .eq("shows.tour_id", tour!.id)
    .eq("creator_payment_cents", 7700);
  expect(opps).toHaveLength(2);
  expect(opps!.every((o) => o.deliverable_requirements.length === 1)).toBe(true);
});
