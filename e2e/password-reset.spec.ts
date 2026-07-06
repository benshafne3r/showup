import { test, expect } from "@playwright/test";

/**
 * Password reset flow (the parts verifiable without a live inbox). The actual
 * email-link → code-exchange → set-password happy path needs a real token and
 * is verified manually; here we cover discoverability, the neutral no-enumeration
 * confirmation, and the two expiry guards.
 */

test("sign-in links to the reset flow", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password/);
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
});

test("requesting a reset shows a neutral confirmation (no account enumeration)", async ({
  page,
}) => {
  await page.goto("/forgot-password");
  // A clearly non-existent address: Supabase returns success without sending,
  // and the UI must not reveal whether an account exists.
  await page.getByLabel("Email").fill(`nobody-${Date.now()}@example.com`);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/if an account exists for that email/i)).toBeVisible();
});

test("update-password without a session redirects to the reset flow", async ({ page }) => {
  await page.goto("/update-password");
  await expect(page).toHaveURL(/\/forgot-password\?error=expired/);
  await expect(page.getByText(/has expired or was already used/i)).toBeVisible();
});

test("an invalid reset link lands back on the reset flow", async ({ page }) => {
  await page.goto("/auth/callback?code=invalid&next=%2Fupdate-password");
  await expect(page).toHaveURL(/\/forgot-password\?error=expired/);
  await expect(page.getByText(/has expired or was already used/i)).toBeVisible();
});
