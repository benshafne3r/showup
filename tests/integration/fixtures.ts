import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
export const SYSTEM = { id: null, role: "system" };

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

/**
 * A confirmed booking with a due, scheduled $10 hold on Mia's (mock) card,
 * on a fresh show `showInDays` from today (negative = already happened).
 */
export async function bookingWithHold(showInDays: number) {
  const { data: mia } = await db.from("users").select("id").eq("email", "creator.mia@demo.showup.test").single();
  const { data: card } = await db.from("payment_methods").select("id").eq("user_id", mia!.id).eq("is_default", true).single();
  const { data: owner } = await db.from("users").select("id").eq("email", "label.owner@demo.showup.test").single();
  const { data: member } = await db.from("company_members").select("company_id").eq("user_id", owner!.id).single();
  const companyId = member!.company_id;
  const { data: artist } = await db.from("artists").select("id").eq("company_id", companyId).limit(1).single();
  const { data: venue } = await db.from("venues").select("id").limit(1).single();

  const { data: show } = await db
    .from("shows")
    .insert({ company_id: companyId, artist_id: artist!.id, venue_id: venue!.id, date: day(showInDays), status: "published" })
    .select("id")
    .single();
  const { data: opp } = await db
    .from("show_opportunities")
    .insert({
      show_id: show!.id,
      company_id: companyId,
      stated_ticket_value_cents: 1000,
      deposit_percentage: 100,
      tickets_total: 10,
      application_deadline: new Date(Date.now() + 86_400_000).toISOString(),
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  const { data: request } = await db
    .from("show_requests")
    .insert({
      opportunity_id: opp!.id,
      show_id: show!.id,
      company_id: companyId,
      creator_id: mia!.id,
      status: "approved",
      ticket_count: 1,
      includes_plus_one: false,
      message: "integration",
    })
    .select("id")
    .single();
  const now = new Date().toISOString();
  const { data: booking, error } = await db
    .from("bookings")
    .insert({
      request_id: request!.id,
      opportunity_id: opp!.id,
      show_id: show!.id,
      company_id: companyId,
      creator_id: mia!.id,
      status: "confirmed",
      stated_ticket_value_cents: 1000,
      deposit_percentage: 100,
      authorization_amount_cents: 1000,
      creator_payment_cents: 5000,
      ticket_count: 1,
      includes_plus_one: false,
      content_required: true,
      content_state: "approved",
      attendance_state: "not_started",
      acceptance_deadline_at: now,
      accepted_at: now,
      terms_accepted_at: now,
      terms_version: "integration",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const { data: auth } = await db
    .from("authorization_records")
    .insert({
      booking_id: booking!.id,
      creator_id: mia!.id,
      company_id: companyId,
      payment_method_id: card!.id,
      status: "scheduled",
      amount_cents: 1000,
      provider: "mock",
      scheduled_for: new Date(Date.now() - 60_000).toISOString(),
    })
    .select("id")
    .single();
  return { bookingId: booking!.id, authId: auth!.id, creatorId: mia!.id, companyId, showId: show!.id };
}

/** A content payment ready to pay out for that booking. */
export async function readyPayment(bookingId: string, creatorId: string, companyId: string) {
  const { data } = await db
    .from("creator_payment_records")
    .insert({ booking_id: bookingId, creator_id: creatorId, company_id: companyId, status: "ready", amount_cents: 5000, provider: "mock" })
    .select("id")
    .single();
  return data!.id;
}

export async function hold(authId: string) {
  const { data } = await db
    .from("authorization_records")
    .select("status, provider_intent_id, capture_amount_cents, lease_until")
    .eq("id", authId)
    .single();
  return data!;
}

/** Holds the mock provider created for this record, with their provider-side status. */
export async function providerIntents(authId: string) {
  const { data } = await db.from("mock_payment_state").select("id, state").eq("kind", "intent").eq("state->>authRecordId", authId);
  return (data ?? []).map((r) => ({ id: r.id, status: (r.state as { status: string }).status }));
}

export async function providerTransfers(paymentRecordId: string) {
  const { data } = await db.from("mock_payment_state").select("id, state").eq("kind", "transfer").like("state->>idempotencyKey", `payout:${paymentRecordId}:%`);
  return data ?? [];
}

/** Make every in-flight lease look abandoned (as if the worker died long ago). */
export async function expireLeases() {
  const past = new Date(Date.now() - 5 * 60_000).toISOString();
  await db.from("authorization_records").update({ lease_until: past }).not("lease_until", "is", null);
  await db.from("creator_payment_records").update({ lease_until: past }).not("lease_until", "is", null);
  await db.from("payment_operations").update({ lease_until: past }).eq("status", "started");
  await db.from("webhook_events").update({ lease_until: past }).eq("status", "processing");
}
