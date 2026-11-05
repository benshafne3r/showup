import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { upsertShow } from "@/server/services/catalog";
import { approveRequest } from "@/server/services/requests";
import { db } from "./fixtures";

/**
 * Guards from the 2026-11-04 Codex review: venues stay per label, a show only
 * joins its own label's tours, finished shows can't be edited, a new date keeps
 * a show open, and past shows can't be approved.
 */

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function columbia() {
  const { data: owner } = await db.from("users").select("id").eq("email", "label.owner@demo.showup.test").single();
  const { data: member } = await db.from("company_members").select("company_id").eq("user_id", owner!.id).single();
  const { data: artist } = await db.from("artists").select("id").eq("company_id", member!.company_id).limit(1).single();
  return { companyId: member!.company_id, artistId: artist!.id, actor: { id: owner!.id, role: "label" } };
}

async function otherLabel() {
  const { data: company } = await db.from("companies").insert({ name: `Other Label ${randomUUID().slice(0, 8)}` }).select("id").single();
  const { data: artist } = await db.from("artists").insert({ company_id: company!.id, name: "Other Artist" }).select("id").single();
  return { companyId: company!.id, artistId: artist!.id, actor: { id: null as unknown as string, role: "label" } };
}

function show(label: { companyId: string; artistId: string; actor: { id: string; role: string } }, venue: object, extra: object = {}) {
  return upsertShow({
    companyId: label.companyId,
    actor: label.actor,
    artistId: label.artistId,
    venue: { name: "Guard Hall", city: "Austin", ...venue },
    date: day(30),
    ticketDeliveryMethod: "will_call",
    ...extra,
  });
}

async function venueOf(showId: string) {
  const { data } = await db.from("shows").select("venue_id, venues(address)").eq("id", showId).single();
  return { id: data!.venue_id, address: data!.venues?.address };
}

describe("show guards", () => {
  it("never matches or edits another label's venue", async () => {
    const name = `Guard Hall ${randomUUID().slice(0, 8)}`;
    const a = await columbia();
    const b = await otherLabel();

    const first = await show(a, { name, address: "1 Main St" });
    if (!first.ok) throw new Error(first.error);
    const other = await show(b, { name, address: "99 Other St" });
    if (!other.ok) throw new Error(other.error);

    const venueA = await venueOf(first.showId);
    const venueB = await venueOf(other.showId);
    expect(venueB.id).not.toBe(venueA.id);
    expect(venueA.address).toBe("1 Main St");

    // The same label typing the name again reuses its own venue.
    const again = await show(a, { name: name.toLowerCase() });
    if (!again.ok) throw new Error(again.error);
    expect((await venueOf(again.showId)).id).toBe(venueA.id);
  });

  it("won't put a show on another label's tour", async () => {
    const a = await columbia();
    const b = await otherLabel();
    const { data: tour } = await db.from("tours").insert({ company_id: b.companyId, artist_id: b.artistId, name: "Not yours" }).select("id").single();
    expect(await show(a, {}, { tourId: tour!.id })).toEqual({ ok: false, error: "Tour not found for this artist" });
  });

  it("won't edit a canceled show", async () => {
    const a = await columbia();
    const created = await show(a, {});
    if (!created.ok) throw new Error(created.error);
    await db.from("shows").update({ status: "canceled" }).eq("id", created.showId);

    expect(await show(a, {}, { showId: created.showId, date: day(40) })).toEqual({
      ok: false,
      error: "This show can no longer be edited",
    });
    const { data } = await db.from("shows").select("date").eq("id", created.showId).single();
    expect(data!.date).toBe(day(30));
  });

  it("keeps a published show open when its date moves", async () => {
    const a = await columbia();
    const created = await show(a, {});
    if (!created.ok) throw new Error(created.error);
    await db.from("shows").update({ status: "published" }).eq("id", created.showId);

    const moved = await show(a, {}, { showId: created.showId, date: day(45) });
    expect(moved.ok).toBe(true);
    const { data } = await db.from("shows").select("status, date, postponed_from").eq("id", created.showId).single();
    expect(data).toEqual({ status: "published", date: day(45), postponed_from: day(30) });
  });

  it("won't approve a request for a show that already happened", async () => {
    const a = await columbia();
    const created = await show(a, {});
    if (!created.ok) throw new Error(created.error);
    await db.from("shows").update({ status: "published", date: day(-2) }).eq("id", created.showId);
    const { data: mia } = await db.from("users").select("id").eq("email", "creator.mia@demo.showup.test").single();
    const { data: opp } = await db
      .from("show_opportunities")
      .insert({
        show_id: created.showId,
        company_id: a.companyId,
        stated_ticket_value_cents: 1000,
        deposit_percentage: 100,
        tickets_total: 5,
        application_deadline: new Date(Date.now() + 86_400_000).toISOString(),
        published_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    const { data: request } = await db
      .from("show_requests")
      .insert({ opportunity_id: opp!.id, show_id: created.showId, company_id: a.companyId, creator_id: mia!.id })
      .select("id")
      .single();

    expect(await approveRequest({ requestId: request!.id, reviewer: a.actor, companyId: a.companyId })).toEqual({
      ok: false,
      error: "This show has already happened",
    });
  });
});
