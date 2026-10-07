import { type Page, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

export const PASSWORD = "ShowUp!Demo1";
export const ACCOUNTS = {
  admin: "admin@demo.showup.test",
  labelOwner: "label.owner@demo.showup.test",
  labelMember: "label.member@demo.showup.test",
  mia: "creator.mia@demo.showup.test",
  jay: "creator.jay@demo.showup.test",
  leo: "creator.leo@demo.showup.test",
  ava: "creator.ava@demo.showup.test",
  nia: "creator.nia@demo.showup.test",
  manager: "manager@demo.showup.test",
};

/**
 * The suite signs the same demo accounts in many times; clear the sign-in
 * rate-limit counter first so the real limit (10 per 5 min) doesn't trip.
 */
async function resetSignInLimit(email: string) {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  await db.from("rate_limits").delete().eq("key", `auth.sign_in:${email.toLowerCase()}`);
}

export async function signIn(page: Page, email: string) {
  await resetSignInLimit(email);
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

/** Today's date (UTC), matching the app's own notion of "today". */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function todayDeadlineLocal(): string {
  return `${todayISO()}T23:00`;
}
