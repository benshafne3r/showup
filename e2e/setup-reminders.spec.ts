import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { ACCOUNTS, signIn } from "./helpers";
import type { Database } from "../src/lib/database.types";

config({ path: ".env.local" });

/**
 * "Finish your setup" nudges: a creator who signed up but never finished
 * their profile or added a card hears from us on day 1 and day 4, then never
 * again. Creators with a card on file are left alone.
 */

const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

async function reminders(userId: string) {
  const { data } = await db
    .from("notifications")
    .select("id, title, link")
    .eq("user_id", userId)
    .eq("type", "setup_reminder")
    .order("created_at", { ascending: true });
  return data ?? [];
}

test("creators who haven't finished setup get two reminders, then none", async ({ page, request }) => {
  const runJobs = async () => {
    const res = await request.post("/api/cron/run", { headers: { "x-cron-secret": process.env.CRON_SECRET! } });
    expect(res.ok()).toBeTruthy();
  };

  // A creator who finished the profile but has no card, a brand-new sign-up
  // who hasn't even done the profile, and Mia (card on file).
  const { data: mia } = await db.from("users").select("id").eq("email", ACCOUNTS.mia).single();
  const tag = Date.now().toString(36);
  const newCreator = async (name: string) => {
    const email = `setup.${name.toLowerCase().replace(" ", ".")}.${tag}@demo.showup.test`;
    const { data, error } = await db.auth.admin.createUser({
      email,
      password: "ShowUp!Demo1",
      email_confirm: true,
      user_metadata: { full_name: name },
    });
    if (error) throw new Error(error.message);
    return { id: data.user.id, email };
  };
  const casey = await newCreator("Casey Card");
  const sam = await newCreator("Sam Setup");
  await db
    .from("creator_profiles")
    .upsert({ user_id: casey.id, city: "Los Angeles", onboarded_at: new Date().toISOString() }, { onConflict: "user_id" });

  try {
    await db.from("users").update({ created_at: daysAgo(2) }).in("id", [casey.id, sam.id, mia!.id]);
    await runJobs();

    const caseyFirst = await reminders(casey.id);
    expect(caseyFirst).toHaveLength(1);
    expect(caseyFirst[0].link).toBe("/creator/payments");
    expect((await reminders(sam.id))[0]?.link).toBe("/creator/onboarding");
    expect(await reminders(mia!.id)).toHaveLength(0);

    // Casey sees it in the app too.
    await signIn(page, casey.email);
    await page.goto("/creator/notifications");
    await expect(page.getByText("Add a card to get your first tickets")).toBeVisible();

    // No repeat on the next run.
    await runJobs();
    expect(await reminders(casey.id)).toHaveLength(1);

    // Day 4: the second (and last) reminder.
    await db.from("users").update({ created_at: daysAgo(5) }).eq("id", casey.id);
    await db.from("notifications").update({ created_at: daysAgo(4) }).eq("id", caseyFirst[0].id);
    await runJobs();
    const caseyAll = await reminders(casey.id);
    expect(caseyAll).toHaveLength(2);
    expect(caseyAll[1].title).toBe("One step left to get free tickets");

    await db.from("notifications").update({ created_at: daysAgo(4) }).eq("id", caseyAll[1].id);
    await runJobs();
    expect(await reminders(casey.id)).toHaveLength(2);
  } finally {
    const now = new Date().toISOString();
    await db.from("users").update({ created_at: now }).eq("id", mia!.id);
    await db.auth.admin.deleteUser(casey.id);
    await db.auth.admin.deleteUser(sam.id);
  }
});
