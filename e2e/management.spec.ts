import { test, expect } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { ACCOUNTS, PASSWORD, signIn, signOut } from "./helpers";

config({ path: ".env.local" });

/**
 * Management companies: invite-only partner sign-up, a manager requesting
 * tickets for a roster creator, label ↔ manager messaging, and the managed
 * creator being kept out of label chats.
 */

const runId = Date.now().toString(36);

function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

async function partnerInviteToken(kind: "label" | "manager", orgName: string) {
  const token = randomBytes(24).toString("base64url");
  const { error } = await serviceClient().from("partner_invites").insert({
    kind,
    org_name: orgName,
    token_hash: createHash("sha256").update(token).digest("hex"),
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  });
  if (error) throw new Error(error.message);
  return token;
}

/** The seeded Greek Theatre show, moved into the future so it's requestable. */
async function openShowId(): Promise<string> {
  const db = serviceClient();
  const { data: venue } = await db.from("venues").select("id").eq("name", "The Greek Theatre").single();
  const { data: show } = await db.from("shows").select("id").eq("venue_id", venue!.id).single();
  const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);
  await db.from("shows").update({ date: inDays(21).toISOString().slice(0, 10) }).eq("id", show!.id);
  await db
    .from("show_opportunities")
    .update({ application_deadline: inDays(14).toISOString() })
    .eq("show_id", show!.id);
  return show!.id;
}

test.describe.configure({ mode: "serial" });

test("public sign-up only offers creator accounts", async ({ page }) => {
  for (const path of ["/sign-up", "/sign-up?role=label"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Create your creator account" })).toBeVisible();
    await expect(page.getByText("Label / Manager")).toHaveCount(0);
  }
});

test("a private partner link creates a management account, once", async ({ page }) => {
  const token = await partnerInviteToken("manager", `E2E Mgmt ${runId}`);
  // The private link is the landing page: pitch + sign-up on one page.
  await page.goto(`/join/${token}`);
  await expect(page.getByRole("heading", { name: /Get your roster into shows/ })).toBeVisible();
  await expect(page.getByText(`Private invite · E2E Mgmt ${runId}`)).toBeVisible();

  await page.getByLabel("Full name").fill("E2E Manager");
  await page.getByLabel("Email").fill(`e2e-mgr-${runId}@demo.showup.test`);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/manager\/onboarding/);
  await expect(page.getByLabel("Company name")).toHaveValue(`E2E Mgmt ${runId}`);
  await page.getByRole("button", { name: "Create company" }).click();
  await expect(page).toHaveURL(/\/manager\?welcome=1/);
  await expect(page.getByRole("heading", { name: "Roster" })).toBeVisible();
  // The app shell (sidebar nav) renders straight after onboarding.
  await expect(page.getByRole("link", { name: "Shows" }).first()).toBeVisible();

  // Single use: the same link is dead now.
  await page.goto(`/join/${token}`);
  await expect(page.getByText("This invite link doesn't work")).toBeVisible();
  await page.goto("/manager");
  await signOut(page);
});

test("a manager requests tickets for a creator on their roster", async ({ page }) => {
  const showId = await openShowId();
  await signIn(page, ACCOUNTS.manager);
  await expect(page).toHaveURL(/\/manager/);
  await expect(page.getByText("Ava Patel")).toBeVisible();
  await expect(page.getByText("Nia Brooks")).toBeVisible();

  await page.goto(`/manager/shows/${showId}`);
  await page.getByLabel("Creator", { exact: true }).selectOption({ label: "Nia Brooks (Atlanta)" });
  await page.getByLabel("Pitch for the artist team (optional)").fill("E2E: Nia covers LA dates too.");
  await page.getByRole("button", { name: "Request tickets" }).click();

  await expect(page).toHaveURL(/\/manager\/messages\?tab=requests&submitted=1/);
  await expect(page.getByText(/Nia Brooks\s*→ Ella Langley/).first()).toBeVisible();
  await signOut(page);
});

test("the label sees it came via management and messages the manager", async ({ page }) => {
  await signIn(page, ACCOUNTS.labelOwner);
  await page.goto("/label/messages?tab=requests");
  await page.getByRole("link", { name: /Nia Brooks · via Northside Talent/ }).first().click();
  await expect(page.getByText("Managed by Northside Talent")).toBeVisible();

  await page.getByRole("link", { name: "Message", exact: true }).click();
  await page.getByPlaceholder(/Write a message/).fill(`E2E label hello ${runId}`);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText(`E2E label hello ${runId}`)).toBeVisible();
  await signOut(page);
});

test("the manager reads and replies on the creator's behalf", async ({ page }) => {
  await signIn(page, ACCOUNTS.manager);
  await page.goto("/manager/messages");
  await page.getByRole("link", { name: /Columbia Records · for Nia Brooks/ }).first().click();
  await expect(page.getByText(`E2E label hello ${runId}`)).toBeVisible();

  await page.getByPlaceholder(/Write a message/).fill(`E2E manager reply ${runId}`);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText(`E2E manager reply ${runId}`)).toBeVisible();
  await expect(page.getByText("Dana Whitfield · Northside Talent").first()).toBeVisible();
  await signOut(page);
});

test("the managed creator is kept out of label chats", async ({ page }) => {
  const db = serviceClient();
  const { data: nia } = await db.from("users").select("id").eq("email", ACCOUNTS.nia).single();
  const { data: thread } = await db
    .from("message_threads")
    .select("id")
    .eq("creator_id", nia!.id)
    .limit(1)
    .single();

  await signIn(page, ACCOUNTS.nia);
  await page.goto("/creator/messages?tab=messages");
  await expect(page.getByText("Northside Talent handles your conversations")).toBeVisible();
  await page.goto(`/creator/messages/${thread!.id}`);
  await expect(page).toHaveURL(/\/creator\/messages\?tab=messages/);
  await page.goto("/creator/settings");
  await expect(page.getByText("Represented by")).toBeVisible();
});

test("roles stay in their own apps", async ({ page }) => {
  await page.goto("/manager");
  await expect(page).toHaveURL(/\/sign-in/);

  await signIn(page, ACCOUNTS.jay);
  await page.goto("/manager");
  await expect(page).toHaveURL(/\/creator/);
  await signOut(page);

  await signIn(page, ACCOUNTS.manager);
  await page.goto("/label");
  await expect(page).toHaveURL(/\/manager/);
  await page.goto("/creator");
  await expect(page).toHaveURL(/\/manager/);
});
