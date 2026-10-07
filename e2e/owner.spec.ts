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

test("the owner can view the app as a creator, read-only", async ({ page }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data: nia } = await db.from("users").select("id").eq("email", ACCOUNTS.nia).single();
  await db.from("creator_profiles").update({ new_show_alerts: false }).eq("user_id", nia!.id);

  await signIn(page, ACCOUNTS.labelOwner);
  await page.goto("/owner");
  await page.getByRole("button", { name: "View as Nia Brooks" }).click();

  // Nia's own Discover page, with the read-only banner.
  await expect(page).toHaveURL(/\/creator/);
  await expect(page.getByText("Viewing as Nia Brooks (creator)")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Discover shows" })).toBeVisible();

  // Trying to change her settings is refused; nothing changes.
  await page.getByRole("button", { name: "Turn on alerts" }).click();
  await page.waitForTimeout(1500);
  const { data: profile } = await db.from("creator_profiles").select("new_show_alerts").eq("user_id", nia!.id).single();
  expect(profile?.new_show_alerts).toBe(false);

  // Leaving puts the owner back on their dashboard, as themselves.
  await page.goto("/owner/stop-viewing");
  await expect(page).toHaveURL(/\/owner$/);
  await expect(page.getByText("Viewing as Nia Brooks")).toHaveCount(0);
  await page.goto("/label/tours");
  await expect(page).toHaveURL(/\/label\/tours/);
});
