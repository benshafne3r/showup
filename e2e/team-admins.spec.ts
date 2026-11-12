import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ACCOUNTS, signIn } from "./helpers";
import type { Database } from "../src/lib/database.types";

const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

/** Management owners and admins invite teammates straight in as admins. */
test("a management owner invites a teammate as an admin", async ({ page }) => {
  const email = `e2e-admin-${Date.now()}@example.com`;
  await signIn(page, ACCOUNTS.manager);
  await page.goto("/manager/settings");

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Role").click();
  await page.getByRole("option", { name: "Admin" }).click();
  await page.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByText(`Invite sent to ${email}`)).toBeVisible();
  await expect(page.getByText(new RegExp(`${email} · admin · expires`))).toBeVisible();

  const { data: invite } = await db.from("agency_invites").select("role").eq("email", email).single();
  expect(invite!.role).toBe("admin");
});

/** The platform owner can make a label or management teammate an admin from the owner dashboard. */
test("the owner makes a label teammate an admin from the owner dashboard", async ({ page }) => {
  const { data: member } = await db.from("users").select("id").eq("email", ACCOUNTS.labelMember).single();
  // Bring them to the top of "Recent signups".
  await db.from("users").update({ created_at: new Date().toISOString() }).eq("id", member!.id);
  const roleOf = async () =>
    (await db.from("company_members").select("role").eq("user_id", member!.id).single()).data!.role;
  expect(await roleOf()).toBe("member");

  await signIn(page, ACCOUNTS.labelOwner);
  await page.goto("/owner");
  const row = page.getByRole("listitem").filter({ hasText: ACCOUNTS.labelMember });
  await row.getByRole("button", { name: "Make admin" }).click();
  await expect(row.getByRole("button", { name: "Make member" })).toBeVisible();
  expect(await roleOf()).toBe("admin");

  await row.getByRole("button", { name: "Make member" }).click();
  await expect(row.getByRole("button", { name: "Make admin" })).toBeVisible();
  expect(await roleOf()).toBe("member");
});
