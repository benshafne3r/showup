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

  // Existing artist is the default selection; just fill the show details.
  await page.getByLabel("Venue / Address").fill("The Echoplex");
  await page.getByRole("textbox", { name: "City" }).fill("Los Angeles");
  await page.getByLabel("Show date").fill("2026-12-15");
  await page.getByLabel("Apply by").fill("2026-12-14");
  await page.getByLabel("Deposit per ticket (USD)").fill("45");

  await page.getByRole("button", { name: "Publish event" }).click();

  await expect(page).toHaveURL(/\/label\/shows\/[0-9a-f-]+\?saved=1/);
  await expect(page.getByText("Show saved.")).toBeVisible();
});

/** One deposit for a whole tour, from the tour's Edit popup. */
test("label sets one deposit for every date on a tour", async ({ page }) => {
  await signIn(page, ACCOUNTS.labelOwner);
  await page.goto("/label/tours");
  await page.getByRole("button", { name: "Edit" }).first().click();
  await page.getByLabel("Deposit per ticket for every date (USD)").fill("35");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/Deposit set to \$35\.00 on \d+ dates?/)).toBeVisible();
});
