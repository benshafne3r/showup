import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn, signOut } from "./helpers";

/**
 * The owner dashboard is private: only the platform owner's accounts (set via
 * OWNER_EMAILS in dev/CI, hard-coded in production) can open it.
 */
test("the owner sees the dashboard from their own portal", async ({ page }) => {
  await signIn(page, ACCOUNTS.labelOwner);
  await page.getByRole("link", { name: "Owner" }).first().click();
  await expect(page).toHaveURL(/\/owner$/);
  await expect(page.getByRole("heading", { name: "Owner dashboard" })).toBeVisible();
  await expect(page.getByText("Total accounts")).toBeVisible();
  await expect(page.getByText("Dana Whitfield")).toBeVisible(); // a recent signup (manager)
});

test("nobody else can open the owner dashboard", async ({ page }) => {
  await page.goto("/owner");
  await expect(page).toHaveURL(/\/sign-in/);

  await signIn(page, ACCOUNTS.jay);
  await expect(page.getByRole("link", { name: "Owner" })).toHaveCount(0);
  await page.goto("/owner");
  await expect(page).not.toHaveURL(/\/owner/);
  await page.goto("/creator");
  await signOut(page);

  await signIn(page, ACCOUNTS.labelMember);
  await page.goto("/owner");
  await expect(page).not.toHaveURL(/\/owner/);
});
