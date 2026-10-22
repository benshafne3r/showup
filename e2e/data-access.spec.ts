import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { ACCOUNTS, PASSWORD, signIn } from "./helpers";
import type { Database } from "../src/lib/database.types";

config({ path: ".env.local" });

/**
 * Direct database API access, the way an attacker would use it: signed in
 * with the public key and their own password, skipping the app. Users can
 * read only what RLS allows and can't write anything; secret venue details
 * and other companies' records stay out of reach.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function apiAs(email: string): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
  return client;
}

test("a creator can't change payout fields, follower counts, roles or messages through the API", async () => {
  const api = await apiAs(ACCOUNTS.mia);
  const { data: mia } = await service.from("users").select("id").eq("email", ACCOUNTS.mia).single();

  // Reading their own profile still works.
  const { data: own, error: readError } = await api.from("creator_profiles").select("id, stripe_payouts_enabled").single();
  expect(readError).toBeNull();
  expect(own?.stripe_payouts_enabled).toBe(false);

  const attempts = await Promise.all([
    api.from("creator_profiles").update({ stripe_payouts_enabled: true, stripe_account_id: "acct_spoof" }).eq("user_id", mia!.id),
    api.from("creator_profiles").update({ verified_at: new Date().toISOString() }).eq("user_id", mia!.id),
    api.from("creator_social_accounts").update({ followers: 99_000_000 }).eq("profile_id", own!.id),
    api.from("users").update({ role: "admin" }).eq("id", mia!.id),
    api.from("messages").insert({ thread_id: crypto.randomUUID(), sender_id: mia!.id, body: "spoof", kind: "text" }),
    api.from("notifications").delete().eq("user_id", mia!.id),
  ]);
  for (const attempt of attempts) {
    expect(attempt.error?.code).toBe("42501"); // permission denied
  }

  const { data: after } = await service.from("creator_profiles").select("stripe_payouts_enabled, stripe_account_id").eq("user_id", mia!.id).single();
  expect(after?.stripe_payouts_enabled).toBe(false);
  expect(after?.stripe_account_id).not.toBe("acct_spoof");
  const { data: role } = await service.from("users").select("role").eq("id", mia!.id).single();
  expect(role?.role).toBe("creator");
});

test("secret venue names and addresses aren't readable through the API", async () => {
  const api = await apiAs(ACCOUNTS.mia);
  const cities = await api.from("venues").select("id, city").limit(3);
  expect(cities.error).toBeNull();
  expect(cities.data?.length).toBeGreaterThan(0);

  for (const column of ["name", "address", "latitude", "longitude"] as const) {
    const res = await api.from("venues").select(column).limit(1);
    expect(res.error?.code, `venues.${column}`).toBe("42501");
  }
});

test("a second label can't see or touch another label's shows and bookings", async ({ page }) => {
  // Real fixtures: Label A is the seeded company; Label B is made here.
  const tag = Date.now().toString(36);
  const emailB = `label.b.${tag}@demo.showup.test`;
  const { data: authB, error } = await service.auth.admin.createUser({
    email: emailB,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "Label B Owner" },
  });
  if (error || !authB.user) throw new Error(error?.message);
  const userB = authB.user.id;
  for (let i = 0; i < 20; i++) {
    const { data } = await service.from("users").select("id").eq("id", userB).maybeSingle();
    if (data) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  await service.from("users").update({ role: "label" }).eq("id", userB);
  const { data: companyB } = await service
    .from("companies")
    .insert({ name: `Label B ${tag}`, onboarded_at: new Date().toISOString() })
    .select("id")
    .single();
  await service.from("company_members").insert({ company_id: companyB!.id, user_id: userB, role: "owner" });

  const { data: labelA } = await service.from("users").select("id").eq("email", ACCOUNTS.labelOwner).single();
  const { data: memberA } = await service.from("company_members").select("company_id").eq("user_id", labelA!.id).single();
  const { data: bookingA } = await service.from("bookings").select("id, show_id").eq("company_id", memberA!.company_id).limit(1).single();

  try {
    // Through the app: Label A's booking and show are "not found" for Label B.
    await signIn(page, emailB);
    await page.goto(`/label/bookings/${bookingA!.id}`);
    await expect(page.getByText("This page doesn't exist")).toBeVisible();
    await page.goto(`/label/shows/${bookingA!.show_id}`);
    await expect(page.getByText("This page doesn't exist")).toBeVisible();

    // Through the API: no rows to read, and no writes at all.
    const api = await apiAs(emailB);
    const read = await api.from("bookings").select("id").eq("id", bookingA!.id);
    expect(read.error).toBeNull();
    expect(read.data).toHaveLength(0);
    const requests = await api.from("show_requests").select("id").eq("company_id", memberA!.company_id);
    expect(requests.data).toHaveLength(0);
    const write = await api.from("shows").update({ status: "canceled" }).eq("id", bookingA!.show_id);
    expect(write.error?.code).toBe("42501");
    const { data: stillThere } = await service.from("shows").select("status").eq("id", bookingA!.show_id).single();
    expect(stillThere?.status).not.toBe("canceled");
  } finally {
    await service.from("company_members").delete().eq("company_id", companyB!.id);
    await service.from("companies").delete().eq("id", companyB!.id);
    await service.auth.admin.deleteUser(userB);
  }
});
