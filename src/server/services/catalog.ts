import "server-only";

import { serviceDb } from "@/server/db/service";
import { audit } from "./audit";
import { notify } from "./notifications";
import { cancelBooking } from "./bookings";
import { getPlatformSettings } from "./settings";
import { uploadFile, publicFileUrl } from "./uploads";

/** Artists, venues, tours, shows — label catalog management. */

export async function upsertArtist(input: {
  companyId: string;
  actor: { id: string; role: string };
  artistId?: string;
  name: string;
  genre: string;
  bio?: string;
  instagramHandle?: string;
  spotifyUrl?: string;
  imageFile?: File | null;
}): Promise<{ ok: true; artistId: string } | { ok: false; error: string }> {
  const db = serviceDb();

  let imageUrl: string | undefined;
  if (input.imageFile && input.imageFile.size > 0) {
    const path = await uploadFile("artist-images", input.companyId, input.imageFile);
    imageUrl = publicFileUrl("artist-images", path);
  }

  if (input.artistId) {
    const { data, error } = await db
      .from("artists")
      .update({
        name: input.name,
        genre: input.genre,
        bio: input.bio ?? "",
        instagram_handle: input.instagramHandle || null,
        spotify_url: input.spotifyUrl || null,
        ...(imageUrl ? { image_url: imageUrl } : {}),
      })
      .eq("id", input.artistId)
      .eq("company_id", input.companyId)
      .select("id")
      .maybeSingle();
    if (error || !data) return { ok: false, error: error?.message ?? "Artist not found" };
    return { ok: true, artistId: data.id };
  }

  const { data, error } = await db
    .from("artists")
    .insert({
      company_id: input.companyId,
      name: input.name,
      genre: input.genre,
      bio: input.bio ?? "",
      instagram_handle: input.instagramHandle || null,
      spotify_url: input.spotifyUrl || null,
      image_url: imageUrl ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  await audit({
    actorId: input.actor.id,
    actorRole: input.actor.role,
    action: "artist.create",
    entityType: "artist",
    entityId: data.id,
    companyId: input.companyId,
    metadata: { name: input.name },
  });
  return { ok: true, artistId: data.id };
}

export async function upsertTour(input: {
  companyId: string;
  actor: { id: string; role: string };
  tourId?: string;
  artistId: string;
  name: string;
  description?: string;
  startsOn?: string;
  endsOn?: string;
}): Promise<{ ok: true; tourId: string } | { ok: false; error: string }> {
  const db = serviceDb();

  const { data: artist } = await db
    .from("artists")
    .select("id")
    .eq("id", input.artistId)
    .eq("company_id", input.companyId)
    .maybeSingle();
  if (!artist) return { ok: false, error: "Artist not found in your company" };

  const values = {
    company_id: input.companyId,
    artist_id: input.artistId,
    name: input.name,
    description: input.description ?? "",
    starts_on: input.startsOn || null,
    ends_on: input.endsOn || null,
  };

  if (input.tourId) {
    const { data, error } = await db
      .from("tours")
      .update(values)
      .eq("id", input.tourId)
      .eq("company_id", input.companyId)
      .select("id")
      .maybeSingle();
    if (error || !data) return { ok: false, error: error?.message ?? "Tour not found" };
    return { ok: true, tourId: data.id };
  }

  const { data, error } = await db.from("tours").insert(values).select("id").single();
  if (error) return { ok: false, error: error.message };
  await audit({
    actorId: input.actor.id,
    actorRole: input.actor.role,
    action: "tour.create",
    entityType: "tour",
    entityId: data.id,
    companyId: input.companyId,
    metadata: { name: input.name },
  });
  return { ok: true, tourId: data.id };
}

async function findOrCreateVenue(input: {
  companyId: string;
  name: string;
  city: string;
  state?: string;
  address?: string;
  capacity?: number;
}): Promise<string> {
  const db = serviceDb();
  const { data: existing } = await db
    .from("venues")
    .select("id")
    .ilike("name", input.name)
    .ilike("city", input.city)
    .maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await db
    .from("venues")
    .insert({
      name: input.name,
      city: input.city,
      state: input.state || null,
      address: input.address || null,
      capacity: input.capacity || null,
      created_by_company: input.companyId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function upsertShow(input: {
  companyId: string;
  actor: { id: string; role: string };
  showId?: string;
  artistId: string;
  tourId?: string;
  venue: { name: string; city: string; state?: string; address?: string; capacity?: number };
  date: string;
  doorsTime?: string;
  startTime?: string;
  title?: string;
  ticketDeliveryMethod: "will_call" | "digital_transfer" | "guest_list" | "box_office";
  imageFile?: File | null;
}): Promise<{ ok: true; showId: string } | { ok: false; error: string }> {
  const db = serviceDb();

  const { data: artist } = await db
    .from("artists")
    .select("id, image_url")
    .eq("id", input.artistId)
    .eq("company_id", input.companyId)
    .maybeSingle();
  if (!artist) return { ok: false, error: "Artist not found in your company" };

  const venueId = await findOrCreateVenue({ companyId: input.companyId, ...input.venue });

  let imageUrl: string | undefined;
  if (input.imageFile && input.imageFile.size > 0) {
    const path = await uploadFile("artist-images", input.companyId, input.imageFile);
    imageUrl = publicFileUrl("artist-images", path);
  }

  const values = {
    company_id: input.companyId,
    artist_id: input.artistId,
    tour_id: input.tourId || null,
    venue_id: venueId,
    title: input.title || null,
    date: input.date,
    doors_time: input.doorsTime || null,
    start_time: input.startTime || null,
    ticket_delivery_method: input.ticketDeliveryMethod,
    ...(imageUrl ? { image_url: imageUrl } : {}),
  };

  if (input.showId) {
    const { data: existing } = await db
      .from("shows")
      .select("id, date, status")
      .eq("id", input.showId)
      .eq("company_id", input.companyId)
      .maybeSingle();
    if (!existing) return { ok: false, error: "Show not found" };

    const dateChanged = existing.date !== input.date && existing.status === "published";
    const { error } = await db.from("shows").update(values).eq("id", input.showId);
    if (error) return { ok: false, error: error.message };
    if (dateChanged) await postponeShowInternal(input.showId, existing.date, input.actor);
    return { ok: true, showId: input.showId };
  }

  const { data, error } = await db
    .from("shows")
    .insert({ ...values, status: "draft" })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  await audit({
    actorId: input.actor.id,
    actorRole: input.actor.role,
    action: "show.create",
    entityType: "show",
    entityId: data.id,
    companyId: input.companyId,
    metadata: { date: input.date },
  });
  return { ok: true, showId: data.id };
}

/**
 * Cancel a show: cancels all active bookings (releasing holds), cancels
 * scheduled authorizations, notifies everyone, audits the action.
 */
export async function cancelShow(input: {
  showId: string;
  actor: { id: string | null; role: string };
  companyId: string;
  reason: string;
}): Promise<{ ok: true; canceledBookings: number } | { ok: false; error: string }> {
  const db = serviceDb();
  const { data: show } = await db
    .from("shows")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
      cancel_reason: input.reason,
    })
    .eq("id", input.showId)
    .eq("company_id", input.companyId)
    .in("status", ["draft", "published", "postponed"])
    .select("id, artists(name)")
    .maybeSingle();
  if (!show) return { ok: false, error: "Show cannot be canceled in its current state" };

  const { data: bookings } = await db
    .from("bookings")
    .select("id, creator_id")
    .eq("show_id", input.showId)
    .in("status", [
      "awaiting_acceptance",
      "awaiting_payment_method",
      "confirmed",
      "authorization_failed",
      "no_show_review",
      "disputed",
    ]);

  let canceled = 0;
  for (const booking of bookings ?? []) {
    const result = await cancelBooking({
      bookingId: booking.id,
      actor: input.actor,
      reason: `Show canceled: ${input.reason}`,
    });
    if (result.ok) canceled++;
    await notify({
      userId: booking.creator_id,
      type: "show_canceled",
      title: `${show.artists?.name ?? "A show"} was canceled`,
      body: "Your booking has been canceled and any temporary hold released. You will not be charged.",
      link: `/creator/bookings/${booking.id}`,
    });
  }

  // Expire outstanding requests.
  await db
    .from("show_requests")
    .update({ status: "expired", expired_at: new Date().toISOString() })
    .eq("show_id", input.showId)
    .in("status", ["pending", "waitlisted"]);

  await audit({
    actorId: input.actor.id,
    actorRole: input.actor.role,
    action: "show.cancel",
    entityType: "show",
    entityId: input.showId,
    companyId: input.companyId,
    metadata: { reason: input.reason, canceledBookings: canceled },
  });
  return { ok: true, canceledBookings: canceled };
}

/** Postpone: new date, reschedule pending authorizations, notify creators. */
async function postponeShowInternal(
  showId: string,
  oldDate: string,
  actor: { id: string | null; role: string },
) {
  const db = serviceDb();
  const { data: show } = await db
    .from("shows")
    .select("id, date, company_id, artists(name)")
    .eq("id", showId)
    .single();
  if (!show) return;

  await db.from("shows").update({ status: "postponed", postponed_from: oldDate }).eq("id", showId);

  const settings = await getPlatformSettings();
  const newScheduled = new Date(`${show.date}T00:00:00`);
  newScheduled.setDate(newScheduled.getDate() - settings.authorizationWindowDays);

  const { data: bookings } = await db
    .from("bookings")
    .select("id, creator_id")
    .eq("show_id", showId)
    .in("status", ["confirmed", "awaiting_acceptance", "awaiting_payment_method", "authorization_failed"]);

  for (const booking of bookings ?? []) {
    await db
      .from("authorization_records")
      .update({ scheduled_for: newScheduled.toISOString() })
      .eq("booking_id", booking.id)
      .eq("status", "scheduled");
    await notify({
      userId: booking.creator_id,
      type: "show_postponed",
      title: `${show.artists?.name ?? "A show"} was postponed`,
      body: `New date: ${show.date}. Your booking carries over — message the team if you can't make it.`,
      link: `/creator/bookings/${booking.id}`,
    });
  }

  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "show.postpone",
    entityType: "show",
    entityId: showId,
    companyId: show.company_id,
    metadata: { oldDate, newDate: show.date },
  });
}
