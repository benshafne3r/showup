import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, signOut } from "./helpers";

/**
 * Definition of Done criterion 13: an administrator can review and resolve a
 * dispute. The seed creates an open attendance dispute (Jay Park, Seattle
 * show, hold authorized).
 */

test("admin reviews and resolves the seeded attendance dispute", async ({ page }) => {
  await signIn(page, ACCOUNTS.admin);
  await expect(page).toHaveURL(/\/admin/);

  // Platform dashboard shows oversight stats.
  await expect(page.getByText("Platform overview")).toBeVisible();
  await expect(page.getByText("Open disputes")).toBeVisible();

  await page.goto("/admin/disputes");
  const disputeCard = page.getByText(/ATTENDANCE dispute — Jay Park/);
  await expect(disputeCard).toBeVisible();

  // Resolve in the creator's favor: release the hold.
  await page.getByLabel("Outcome").first().click();
  await page
    .getByRole("option", { name: /Release the hold/ })
    .click();
  await page
    .getByLabel("Resolution notes (sent to both parties)")
    .first()
    .fill("Photo evidence confirms attendance during the headline set. Hold released.");
  await page.getByRole("button", { name: "Resolve dispute" }).click();

  // The page revalidates: the open card disappears and the dispute lands in
  // the Resolved section with our notes.
  await expect(page.getByText(/Photo evidence confirms attendance/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Resolve dispute" })).toHaveCount(0);
  await signOut(page);

  // The creator sees the outcome on their side.
  await signIn(page, ACCOUNTS.jay);
  await page.goto("/creator/payments");
  await expect(page.getByText("Hold released").first()).toBeVisible();
});

test("admin audit log records the resolution", async ({ page }) => {
  await signIn(page, ACCOUNTS.admin);
  await page.goto("/admin/audit-logs?action=dispute");
  await expect(page.getByText("dispute.resolve").first()).toBeVisible();
});
