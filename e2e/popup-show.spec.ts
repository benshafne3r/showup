import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn } from "./helpers";

/**
 * The Create dialog's "Pop-up show" tab creates a standalone one-off show
 * (no tour) in a city, published instantly.
 */
test("label creates a one-off pop-up show", async ({ page }) => {
  await signIn(page, ACCOUNTS.labelOwner);
  await page.goto("/label/tours");

  await page.getByRole("button", { name: "Create" }).first().click();
  await page.getByRole("tab", { name: "Event" }).click();

  // Picking an artist the label already has reuses it (matched by name).
  await page.getByLabel("Search Spotify for an artist").fill("Baby Keem");
  await page.getByRole("button", { name: "Baby Keem", exact: true }).click();
  await page.getByLabel("Venue / Address").fill("The Echoplex");
  // City type-ahead (offline US city list): picking fills the city (and state).
  await page.getByLabel("City", { exact: true }).fill("Los Ang");
  await page.getByRole("option", { name: "Los Angeles, CA", exact: true }).click();
  await expect(page.getByLabel("City", { exact: true })).toHaveValue("Los Angeles");
  await page.getByLabel("Show date").fill("2026-12-15");
  await page.getByLabel("Apply by").fill("2026-12-14");
  await page.getByLabel("Deposit per ticket (USD)").fill("45");

  await page.getByRole("button", { name: "Publish event" }).click();

  await expect(page).toHaveURL(/\/label\/shows\/[0-9a-f-]+\?saved=1/);
  await expect(page.getByText("Show saved.")).toBeVisible();

  // Shows page: the one-off gets the same card as a tour, under Active (not Past).
  await page.goto("/label/tours");
  const card = page.locator("div.rounded-xl").filter({ hasText: "One-off show" }).filter({ hasText: "Tue, Dec 15" }).first();
  await expect(card).toBeVisible();
  await expect(card.getByRole("link", { name: "Edit" })).toBeVisible();
  await page.getByRole("link", { name: /^Past/ }).click();
  await expect(page).toHaveURL(/view=past/);
  await expect(page.getByText("Tue, Dec 15 · Los Angeles")).toHaveCount(0);
});

/** One deposit for a whole tour, from the tour's Edit popup. */
test("label sets one deposit for every date on a tour", async ({ page }) => {
  await signIn(page, ACCOUNTS.labelOwner);
  await page.goto("/label/tours?view=all"); // the seed tours' dates may all be past

  await page.getByRole("button", { name: "Edit" }).first().click();
  await page.getByLabel("Deposit per ticket for every date (USD)").fill("35");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/Deposit set to \$35\.00 on \d+ dates?/)).toBeVisible();
});
