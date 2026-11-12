import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { ACCOUNTS, signIn, signOut } from "./helpers";
import type { Database } from "../src/lib/database.types";

config({ path: ".env.local" });

/**
 * Agency-run rosters: a label picks creators for a show by city (then same
 * state); picks on an agency roster go to the agency, which accepts with the
 * hold on its own card, or passes. The managed creators never hear from the
 * label directly.
 */

const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

test("label invites managed creators; the agency accepts one on its card and passes on the other", async ({ page }) => {
  // The seeded Greek Theatre (Los Angeles) show, moved to tomorrow so the hold
  // is placed as soon as it's accepted.
  const { data: venue } = await db.from("venues").select("id").eq("name", "The Greek Theatre").single();
  const { data: show } = await db
    .from("shows")
    .select("id, date, show_opportunities(id, application_deadline)")
    .eq("venue_id", venue!.id)
    .single();
  const opp = show!.show_opportunities!;
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  await db.from("shows").update({ date: tomorrow, status: "published" }).eq("id", show!.id);
  await db
    .from("show_opportunities")
    .update({ application_deadline: new Date(Date.now() + 3_600_000).toISOString() })
    .eq("id", opp.id);

  const { data: rae } = await db.from("users").select("id").eq("full_name", "Rae Rivers").single();
  const { data: kai } = await db.from("users").select("id").eq("full_name", "Kai Moreno").single();
  const { data: agency } = await db.from("agencies").select("id").eq("name", "Northside Talent").single();
  const { data: agencyCard } = await db.from("payment_methods").select("id").eq("agency_id", agency!.id).single();
  const bookingFor = async (creatorId: string) =>
    (
      await db
        .from("bookings")
        .select("id, status, cancel_reason, hold_agency_id, authorization_records(status, payment_method_id)")
        .eq("show_id", show!.id)
        .eq("creator_id", creatorId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single()
    ).data!;

  try {
    // Label: Rae is in LA, Kai is "nearby" (San Diego, California).
    await signIn(page, ACCOUNTS.labelOwner);
    await page.goto(`/label/shows/${show!.id}`);
    const picker = page.locator("form").filter({ has: page.getByText("In Los Angeles") });
    await expect(picker.getByRole("group", { name: /In Los Angeles/ }).getByText("Rae Rivers")).toBeVisible();
    // Nearby starts folded away.
    await expect(picker.getByText("Kai Moreno")).toHaveCount(0);
    await picker.getByRole("button", { name: /Nearby/ }).click();
    await expect(picker.getByRole("group", { name: /Nearby/ }).getByText("Kai Moreno")).toBeVisible();
    await expect(picker.getByText("via Northside Talent").first()).toBeVisible();

    await picker.getByRole("checkbox", { name: "Invite Rae Rivers" }).check();
    await picker.getByRole("checkbox", { name: "Invite Kai Moreno" }).check();
    // The floating bar sends them in the background and reports back.
    await page.getByRole("region", { name: "Send invites" }).getByRole("button", { name: "Invite 2 creators" }).click();
    await expect(page.getByText("Sending 2 invites. You'll get a notification when they're out.")).toBeVisible();
    await expect(picker.getByRole("checkbox", { name: "Invite Rae Rivers" })).toBeDisabled();

    await expect.poll(async () => (await bookingFor(rae!.id))?.status).toBe("awaiting_acceptance");
    const { data: owner } = await db.from("users").select("id").eq("email", ACCOUNTS.labelOwner).single();
    await expect
      .poll(async () => (await db.from("notifications").select("title").eq("user_id", owner!.id).eq("title", "Invited 2 creators")).data?.length)
      .toBe(1);
    // Managed profiles are never notified directly; their agency is.
    const { count: raeNotes } = await db
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", rae!.id);
    expect(raeNotes).toBe(0);
    await signOut(page);

    // Agency: both invites wait in Messages → Requests, grouped by show; the
    // Messages tab shows the count. Accept Rae on the agency card.
    await signIn(page, ACCOUNTS.manager);
    await page.goto("/manager");
    await expect(page.getByRole("heading", { name: /Waiting on you/ })).toHaveCount(0); // not on the roster any more
    await page.getByRole("link", { name: /^Messages/ }).click();
    const waiting = page.getByRole("region", { name: /Waiting on you/ });
    await expect(waiting.getByRole("heading", { name: /Waiting on you\s*2/ })).toBeVisible();
    await expect(waiting.getByText(/Holds go on visa •••• 1881/)).toBeVisible();
    // A ready-to-send invite text per creator: copy it, or open Messages with it.
    await expect(waiting.getByRole("button", { name: "Copy the invite text for Rae Rivers" })).toBeVisible();
    await expect(waiting.getByRole("link", { name: "Text Rae Rivers the invite" })).toHaveAttribute(
      "href",
      /^sms:\?&body=Hey%20Rae!.+Wanted%20to%20invite%20you/,
    );
    const raeRow = waiting.getByRole("listitem").filter({ hasText: "Rae Rivers" });
    await raeRow.getByRole("button", { name: "Accept" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Accept" }).click();
    await expect(page.getByText("Accepted for Rae Rivers")).toBeVisible();
    await expect(waiting.getByRole("heading", { name: /Waiting on you\s*1/ })).toBeVisible();

    await expect
      .poll(async () => (await bookingFor(rae!.id)).status)
      .toBe("confirmed");
    const raeBooking = await bookingFor(rae!.id);
    expect(raeBooking.hold_agency_id).toBe(agency!.id);
    expect(raeBooking.authorization_records[0]?.payment_method_id).toBe(agencyCard!.id);
    expect(raeBooking.authorization_records[0]?.status).toBe("authorized");

    // …and pass on Kai: the ticket goes back to the label.
    const kaiRow = waiting.getByRole("listitem").filter({ hasText: "Kai Moreno" });
    await kaiRow.getByRole("button", { name: "Pass" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Pass" }).click();
    await expect.poll(async () => (await bookingFor(kai!.id)).cancel_reason).toBe("declined");

    // The agency's card lives in Payments.
    await page.goto("/manager/payments");
    await expect(page.getByText("Card for ticket holds")).toBeVisible();
    await expect(page.getByText("visa •••• 1881")).toBeVisible();
    await signOut(page);

    // Label: Rae is now taken; Kai can be invited again.
    await signIn(page, ACCOUNTS.labelOwner);
    await page.goto(`/label/shows/${show!.id}`);
    await expect(page.getByRole("checkbox", { name: "Invite Rae Rivers" })).toBeDisabled();
    await page.getByRole("button", { name: /Nearby/ }).click();
    await expect(page.getByRole("checkbox", { name: "Invite Kai Moreno" })).toBeEnabled();

    // The Creators tab lists every creator; filter to a city and pick the show.
    await page.getByRole("link", { name: "Creators", exact: true }).click();
    await page.getByRole("combobox", { name: "City" }).click();
    await page.getByRole("option", { name: /San Diego/ }).click();
    await expect(page).toHaveURL(/city=san\+diego/);
    await expect(page.getByRole("checkbox", { name: "Invite Kai Moreno" })).toBeEnabled();
    // Ticking someone brings up the floating invite panel.
    await page.getByRole("checkbox", { name: "Invite Kai Moreno" }).check();
    await expect(page.getByRole("region", { name: "Invite selected creators" }).getByText("Invite them to")).toBeVisible();
    await expect(page.getByRole("link", { name: "Kai Moreno on TikTok (opens in a new tab)" })).toHaveAttribute(
      "href",
      "https://www.tiktok.com/@kaimoreno",
    );
  } finally {
    await db.from("shows").update({ date: show!.date }).eq("id", show!.id);
    await db.from("show_opportunities").update({ application_deadline: opp.application_deadline }).eq("id", opp.id);
  }
});
