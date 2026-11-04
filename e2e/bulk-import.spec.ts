import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn } from "./helpers";

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
