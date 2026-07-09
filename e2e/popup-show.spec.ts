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
  await page.getByRole("tab", { name: "Pop-up show" }).click();

  // Existing artist is the default selection; just fill the show details.
  await page.getByLabel("Venue").fill("The Echoplex");
  await page.getByLabel("City").fill("Los Angeles");
  await page.getByLabel("Show date").fill("2026-12-15");
  await page.getByLabel("Apply by").fill("2026-12-14");
  await page.getByLabel("Ticket value (USD)").fill("90");

  await page.getByRole("button", { name: "Publish pop-up" }).click();

  await expect(page).toHaveURL(/\/label\/shows\/[0-9a-f-]+\?saved=1/);
  await expect(page.getByText("Show saved.")).toBeVisible();
});
