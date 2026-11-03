import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { ACCOUNTS, signIn } from "./helpers";

config({ path: ".env.local" });

/**
 * A management company adds a creator from their TikTok: no email asked for
 * or sent; they land on the roster as a managed profile. (Tests have no TikWM
 * key, so the manager types the name, like when TikTok can't be reached.)
 */
test("a manager adds a creator from a TikTok link", async ({ page }) => {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const handle = `e2ecreator${Date.now().toString(36)}`;

  await signIn(page, ACCOUNTS.manager);
  await page.goto("/manager");
  await page.getByRole("button", { name: "Add creator" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/email/i)).toHaveCount(0); // nothing asks for an email
  await dialog.getByLabel("TikTok").fill(`https://www.tiktok.com/@${handle}`);
  await dialog.getByRole("button", { name: "Find creator" }).click();

  await expect(dialog.getByText(`@${handle}`)).toBeVisible();
  await dialog.getByLabel("Name").fill("Jordan Lee");
  await dialog.getByLabel("Location").fill("Austin, TX");
  await dialog.getByLabel("Genres").fill("comedy, dance");
  await expect(dialog.getByText("No email is sent")).toBeVisible();
  await dialog.getByRole("button", { name: "Add to roster" }).click();

  await expect(page.getByText("Jordan Lee is on your roster")).toBeVisible();
  await expect(page.getByRole("link", { name: "Jordan Lee", exact: true })).toBeVisible();

  const { data: social } = await db
    .from("creator_social_accounts")
    .select("handle, creator_profiles!inner(city, region, categories, users!inner(managed_profile, email))")
    .eq("handle", handle)
    .single();
  expect(social?.creator_profiles).toMatchObject({
    city: "Austin",
    region: "TX",
    categories: ["comedy", "dance"],
    users: { managed_profile: true },
  });
  expect((social?.creator_profiles as unknown as { users: { email: string } }).users.email).toMatch(/@profiles\.showup\.invalid$/);
});
