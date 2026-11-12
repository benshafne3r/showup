import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ACCOUNTS, signIn } from "./helpers";
import type { Database } from "../src/lib/database.types";

const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

/**
 * "Add a date" on a tour: the artist and tour are fixed (no artist list), the
 * artist's announced dates load on open, and picking one fills the form.
 */
test("label adds one more date to a tour from the artist's announced dates", async ({ page }) => {
  await signIn(page, ACCOUNTS.labelOwner);
  await page.goto("/label/tours?view=all");

  const tourCard = page.locator("div.rounded-xl").filter({ hasText: "The Dandelion Tour 2026" }).first();
  await tourCard.getByRole("link", { name: "Add a date" }).click();
  await expect(page.getByRole("heading", { name: "Add a date to The Dandelion Tour 2026" })).toBeVisible();
  await expect(page.locator("#show-artist")).toHaveCount(0);

  const firstDate = page.locator("ul li button[aria-pressed]").first();
  await expect(firstDate).toBeVisible();
  await firstDate.click();
  await expect(firstDate).toHaveAttribute("aria-pressed", "true");
  const venue = await page.getByLabel("Venue name").inputValue();
  expect(venue).not.toBe("");
  // Applications close at noon on the show date unless the label changes it.
  const date = await page.getByLabel("Date", { exact: true }).inputValue();
  await expect(page.getByLabel("Application deadline")).toHaveValue(`${date}T12:00`);

  await page.getByLabel("Deposit per ticket (USD)").fill("25");
  await page.getByLabel("Tickets available to creators").fill("3");
  await page.getByRole("button", { name: "Publish show" }).click();
  await expect(page).toHaveURL(/\/label\/shows\/[0-9a-f-]+\?saved=1/);

  const showId = page.url().match(/shows\/([0-9a-f-]+)/)![1];
  const { data: show } = await db
    .from("shows")
    .select("status, tours(name), venues(name), show_opportunities(application_deadline)")
    .eq("id", showId)
    .single();
  expect(show).toMatchObject({ status: "published", tours: { name: "The Dandelion Tour 2026" }, venues: { name: venue } });
  // Saved as that exact moment in the browser's time zone.
  expect(new Date(show!.show_opportunities!.application_deadline).toISOString()).toBe(new Date(`${date}T12:00`).toISOString());
});
