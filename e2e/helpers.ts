import { type Page, expect } from "@playwright/test";

export const PASSWORD = "ShowUp!Demo1";
export const ACCOUNTS = {
  admin: "admin@demo.showup.test",
  labelOwner: "label.owner@demo.showup.test",
  labelMember: "label.member@demo.showup.test",
  mia: "creator.mia@demo.showup.test",
  jay: "creator.jay@demo.showup.test",
  leo: "creator.leo@demo.showup.test",
};

export async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/sign-in/, { timeout: 30_000 });
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await page.waitForURL("**/");
}

/** A tiny valid PNG for upload fields. */
export function pngFixture(name = "proof.png") {
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  return { name, mimeType: "image/png", buffer: Buffer.from(base64, "base64") };
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function todayDeadlineLocal(): string {
  const d = new Date();
  return `${d.toISOString().slice(0, 10)}T23:00`;
}
