import { describe, expect, it } from "vitest";
import { payoutDestinationFor } from "@/server/services/connect";
import { bookingWithHold, db } from "./fixtures";

/**
 * The agency whose card held a booking's deposit is paid for that booking,
 * even after the creator leaves its roster (Ben, 2026-11-04).
 */
describe("payout destination", () => {
  it("pays the agency that held the deposit, not the creator's current one", async () => {
    const { data: agency } = await db.from("agencies").select("id, name").eq("name", "Northside Talent").single();
    const b = await bookingWithHold(10);

    // Booked by Mia herself, not on any roster: Mia is paid.
    expect((await payoutDestinationFor(b.bookingId)).agency).toBeNull();

    // Booked through Northside, and Mia isn't (or is no longer) on its roster.
    await db.from("bookings").update({ hold_agency_id: agency!.id }).eq("id", b.bookingId);
    expect((await payoutDestinationFor(b.bookingId)).agency).toEqual({ id: agency!.id, name: agency!.name });
  });
});
