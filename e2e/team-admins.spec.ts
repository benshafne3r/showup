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

/**
 * Viewing as a label teammate stays read-only, except team access: the owner
 * can invite people (as admins) and switch roles, recorded as the owner.
 */
test("the owner gives team access while viewing as a label teammate", async ({ page }) => {
  const { data: member } = await db.from("users").select("id, full_name").eq("email", ACCOUNTS.labelMember).single();
  const { data: owner } = await db.from("users").select("id").eq("email", ACCOUNTS.labelOwner).single();
  await db.from("users").update({ created_at: new Date().toISOString() }).eq("id", member!.id);
  const email = `e2e-viewing-${Date.now()}@example.com`;

  await signIn(page, ACCOUNTS.labelOwner);
  await page.goto("/owner");
  await page.getByRole("button", { name: `View as ${member!.full_name}` }).click();
  await expect(page.getByText(`Viewing as ${member!.full_name}`)).toBeVisible();

  // A member can't manage the team, but the owner viewing as them can.
  await page.goto("/label/settings");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Role").click();
  await page.getByRole("option", { name: "Admin" }).click();
  await page.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByText(`Invite sent to ${email}`)).toBeVisible();
  const { data: invite } = await db.from("company_invites").select("role, invited_by").eq("email", email).single();
  expect(invite).toEqual({ role: "admin", invited_by: owner!.id });

  await page.goto("/owner/stop-viewing");
  await expect(page).toHaveURL(/\/owner$/);
});

test("only the platform owner can use the owner team endpoint", async ({ page }) => {
  const { data: company } = await db.from("companies").select("id").eq("name", "Columbia Records").limit(1).single();
  const payload = { op: "invite", kind: "label", orgId: company!.id, email: "nope@example.com", role: "admin" };

  expect((await page.request.post("/api/owner/team", { data: payload })).status()).toBe(403); // signed out
  await signIn(page, ACCOUNTS.labelMember);
  expect((await page.request.post("/api/owner/team", { data: payload })).status()).toBe(403);
  expect((await db.from("company_invites").select("id").eq("email", "nope@example.com")).data).toEqual([]);
});
