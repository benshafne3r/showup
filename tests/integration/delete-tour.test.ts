import { describe, expect, it } from "vitest";
import { deleteShow, deleteTour } from "@/server/services/catalog";
import { bookingWithHold, db } from "./fixtures";

/**
 * Deleting a tour: live bookings block it; invites that were canceled before
 * anyone accepted go with their show; a canceled show with hold/payment
 * records is kept (off the tour) for the books.
 */

async function tourOf(companyId: string, showIds: string[]) {
  const { data: artist } = await db.from("artists").select("id").eq("company_id", companyId).limit(1).single();
  const { data: tour } = await db
    .from("tours")
    .insert({ company_id: companyId, artist_id: artist!.id, name: "Delete me" })
    .select("id")
    .single();
  await db.from("shows").update({ tour_id: tour!.id }).in("id", showIds);
  return tour!.id;
}

describe("deleting a tour", () => {
  it("blocks on live bookings, drops never-accepted invites, keeps shows with payment history", async () => {
    const paid = await bookingWithHold(10); // confirmed, with a hold record
    const invite = await bookingWithHold(12);
    // Turn the second into an invite that was canceled before anyone accepted (no money moved).
    await db.from("authorization_records").delete().eq("id", invite.authId);
    await db.from("bookings").update({ status: "canceled", accepted_at: null, terms_accepted_at: null }).eq("id", invite.bookingId);

    const { companyId } = paid;
    const { data: owner } = await db.from("users").select("id").eq("email", "label.owner@demo.showup.test").single();
    const actor = { id: owner!.id, role: "label" };
    const tourId = await tourOf(companyId, [paid.showId, invite.showId]);
    const blocked = { ok: false, error: "Some shows have creator bookings. Cancel those shows first." };

    expect(await deleteTour({ tourId, companyId, actor })).toEqual(blocked);

    // Booking canceled but the show is still up: still blocked.
    await db.from("bookings").update({ status: "canceled" }).eq("id", paid.bookingId);
    expect(await deleteTour({ tourId, companyId, actor })).toEqual(blocked);

    await db.from("shows").update({ status: "canceled" }).eq("id", paid.showId);
    expect(await deleteTour({ tourId, companyId, actor })).toEqual({ ok: true, deletedShows: 1 });

    expect((await db.from("tours").select("id").eq("id", tourId)).data).toEqual([]);
    expect((await db.from("shows").select("id").eq("id", invite.showId)).data).toEqual([]);
    expect((await db.from("bookings").select("id").eq("id", invite.bookingId)).data).toEqual([]);
    const { data: kept } = await db.from("shows").select("status, tour_id").eq("id", paid.showId).single();
    expect(kept).toEqual({ status: "canceled", tour_id: null });

    expect(await deleteShow({ showId: paid.showId, companyId, actor })).toEqual({
      ok: false,
      error: "This show has payment history, so it's kept for your records.",
    });
  });
});
