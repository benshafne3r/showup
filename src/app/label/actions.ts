"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser, requireLabelWithCompany, requireCompanyRole } from "@/server/auth/guards";
import { createCompany, inviteMember, removeMember, changeMemberRole } from "@/server/services/companies";
import { serviceDb } from "@/server/db/service";
import { artistFromSpotify, upsertArtist, upsertTour, upsertShow, cancelShow, deleteTour, deleteShow } from "@/server/services/catalog";
import { setTourDeposit, upsertOpportunity } from "@/server/services/opportunities";
import { approveRequest, rejectRequest, waitlistRequest } from "@/server/services/requests";
import { creatorsInCity, queueOffers } from "@/server/services/offers";
import { runOutboxNow } from "@/server/jobs/queue";
import { sendTicketInstructions, cancelBooking } from "@/server/services/bookings";
import {
  approveAttendance,
  markAllAttended,
  markAttended,
  rejectAttendance,
  resolveNoShow,
} from "@/server/services/attendance";
import { audit } from "@/server/services/audit";
import { reviewContent } from "@/server/services/content";
import { fundAndPayout } from "@/server/services/funding";
import { attachCompanyPaymentMethod, finishCardSetup, startCardSetup } from "@/server/services/payments";
import { formatCents, parseDollarsToCents } from "@/lib/money";
import { searchArtists, type SpotifyArtist } from "@/server/providers/spotify";
import { enrichArtist } from "@/server/providers/artist-enrich";
import { searchCities } from "@/server/providers/places";
import { searchVenues } from "@/server/services/venues";
import { withinRateLimit } from "@/server/services/rate-limit";
import type { CitySuggestion, VenueSuggestion } from "@/lib/places";
import { toActionError } from "@/server/action-error";

// NOTE: "use server" files may only export async functions; a re-exported type
// trips Next's server-action bundler. Declare the type inline (it is erased at
// compile time) rather than re-exporting it from @/server/action-error.
export type ActionState = { error: string } | { success: string } | null;

const fail = (err: unknown): ActionState => toActionError(err, "label.action");

// ── Company onboarding & team ───────────────────────────────────────────

const companySchema = z.object({
  name: z.string().min(2, "Enter your company name").max(120),
  kind: z.enum(["label", "management", "agency"]),
  website: z.string().url("Enter a valid URL").or(z.literal("")),
});

export async function createCompanyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    if (user.role !== "label") return { error: "Label account required" };
    const parsed = companySchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const result = await createCompany({ userId: user.id, ...parsed.data });
    if (!result.ok) return { error: result.error };
  } catch (err) {
    return fail(err);
  }
  // The label layout rendered without a company during onboarding; make it
  // re-render so the app shell (nav + padding) appears after the redirect.
  revalidatePath("/label", "layout");
  redirect("/label?welcome=1");
}

export async function inviteMemberAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await requireLabelWithCompany();
    await requireCompanyRole(context.companyId, "admin");
    const email = z.string().email("Enter a valid email").parse(formData.get("email"));
    const role = z.enum(["admin", "member"]).parse(formData.get("role") ?? "member");
    const result = await inviteMember({
      companyId: context.companyId,
      inviter: { id: context.user.id, role: "label" },
      email,
      role,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath("/label/settings");
    return { success: `Invite sent to ${email}` };
  } catch (err) {
    return fail(err);
  }
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const context = await requireLabelWithCompany();
  await requireCompanyRole(context.companyId, "admin");
  const memberUserId = z.string().uuid().parse(formData.get("memberUserId"));
  await removeMember({
    companyId: context.companyId,
    actor: { id: context.user.id, role: "label" },
    memberUserId,
  });
  revalidatePath("/label/settings");
}

export async function changeMemberRoleAction(formData: FormData): Promise<void> {
  const context = await requireLabelWithCompany();
  await requireCompanyRole(context.companyId, "admin");
  const memberUserId = z.string().uuid().parse(formData.get("memberUserId"));
  const newRole = z.enum(["admin", "member"]).parse(formData.get("newRole"));
  await changeMemberRole({
    companyId: context.companyId,
    actor: { id: context.user.id, role: "label" },
    memberUserId,
    newRole,
  });
  revalidatePath("/label/settings");
}

// ── Artists & tours ─────────────────────────────────────────────────────

/** Type-ahead search of Spotify's artist catalog (label users only). */
export async function searchSpotifyArtistsAction(query: string): Promise<SpotifyArtist[]> {
  const context = await requireLabelWithCompany();
  if (!(await withinRateLimit("lookup.search", context.user.id))) return [];
  return searchArtists(query);
}

/**
 * Best-effort bio + Instagram for a picked artist (MusicBrainz + Wikipedia,
 * since Spotify has neither). Blanks on miss — never throws.
 */
export async function enrichArtistAction(name: string): Promise<{ bio: string; instagram: string }> {
  const context = await requireLabelWithCompany();
  if (!(await withinRateLimit("lookup.search", context.user.id))) return { bio: "", instagram: "" };
  return enrichArtist(name);
}

/** US cities for the city type-ahead ("Milw" → Milwaukee, WI). */
export async function suggestCitiesAction(query: string): Promise<CitySuggestion[]> {
  await requireLabelWithCompany();
  return searchCities(String(query).slice(0, 80));
}

/** Venues for the venue type-ahead: the label's own, then Ticketmaster's. */
export async function suggestVenuesAction(query: string): Promise<VenueSuggestion[]> {
  const context = await requireLabelWithCompany();
  if (!(await withinRateLimit("lookup.search", context.user.id))) return [];
  return searchVenues(context.companyId, String(query).slice(0, 80));
}

/** The artist picked from Spotify search (tour + pop-up create forms). */
const artistFields = {
  artistName: z.string().trim().min(1, "Search Spotify and pick the artist").max(120),
  artistGenre: z.string().max(60).optional().or(z.literal("")),
  artistBio: z.string().max(1000).optional().or(z.literal("")),
  artistInstagram: z.string().max(60).optional().or(z.literal("")),
  // Empty for an artist the label added before Spotify search (picked via their tour).
  artistSpotifyUrl: z.string().url("Search Spotify and pick the artist").or(z.literal("")),
  artistImageUrl: z.string().url().or(z.literal("")).optional(),
};

/** The company's artist for the Spotify pick in a create form. */
function artistFromForm(data: z.infer<z.ZodObject<typeof artistFields>>, companyId: string, actor: { id: string; role: string }) {
  return artistFromSpotify({
    companyId,
    actor,
    name: data.artistName,
    genre: data.artistGenre ?? "",
    bio: data.artistBio ?? "",
    instagramHandle: (data.artistInstagram ?? "").replace(/^@/, ""),
    spotifyUrl: data.artistSpotifyUrl,
    imageUrl: data.artistImageUrl ?? "",
  });
}

const tourSchema = z.object({
  tourId: z.string().uuid().optional().or(z.literal("")),
  ...artistFields,
  name: z.string().min(1, "Tour name is required").max(160),
  description: z.string().max(1000),
  startsOn: z.string().optional().or(z.literal("")),
  endsOn: z.string().optional().or(z.literal("")),
});

export async function saveTourAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await requireLabelWithCompany();
    const parsed = tourSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const actor = { id: context.user.id, role: "label" as const };

    const artist = await artistFromForm(parsed.data, context.companyId, actor);
    if (!artist.ok) return { error: artist.error };
    const artistId = artist.artistId;

    const result = await upsertTour({
      companyId: context.companyId,
      actor,
      tourId: parsed.data.tourId || undefined,
      artistId,
      name: parsed.data.name,
      description: parsed.data.description,
      startsOn: parsed.data.startsOn,
      endsOn: parsed.data.endsOn,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath("/label/tours");
    return { success: "Tour saved" };
  } catch (err) {
    return fail(err);
  }
}

// Merged edit: the artist's details AND the tour, saved together (one popup).
const tourEditSchema = z.object({
  tourId: z.string().uuid(),
  artistId: z.string().uuid(),
  artistName: z.string().min(1, "Artist name is required").max(120),
  artistGenre: z.string().max(60),
  artistBio: z.string().max(1000),
  artistInstagram: z.string().max(60),
  artistSpotifyUrl: z.string().url().or(z.literal("")),
  artistImageUrl: z.string().url().or(z.literal("")).optional(),
  name: z.string().min(1, "Tour name is required").max(160),
  description: z.string().max(1000),
  startsOn: z.string().optional().or(z.literal("")),
  endsOn: z.string().optional().or(z.literal("")),
  // Blank = leave each date's deposit as it is.
  tourDeposit: z.string().max(12).optional().or(z.literal("")),
});

export async function saveTourEditAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await requireLabelWithCompany();
    const parsed = tourEditSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const actor = { id: context.user.id, role: "label" as const };
    const image = formData.get("image");

    const artist = await upsertArtist({
      companyId: context.companyId,
      actor,
      artistId: parsed.data.artistId,
      name: parsed.data.artistName,
      genre: parsed.data.artistGenre,
      bio: parsed.data.artistBio,
      instagramHandle: parsed.data.artistInstagram.replace(/^@/, ""),
      spotifyUrl: parsed.data.artistSpotifyUrl,
      imageFile: image instanceof File ? image : null,
      remoteImageUrl: parsed.data.artistImageUrl || undefined,
    });
    if (!artist.ok) return { error: artist.error };

    const tour = await upsertTour({
      companyId: context.companyId,
      actor,
      tourId: parsed.data.tourId,
      artistId: parsed.data.artistId,
      name: parsed.data.name,
      description: parsed.data.description,
      startsOn: parsed.data.startsOn,
      endsOn: parsed.data.endsOn,
    });
    if (!tour.ok) return { error: tour.error };

    let depositNote = "";
    if (parsed.data.tourDeposit?.trim()) {
      let depositCents: number;
      try {
        depositCents = parseDollarsToCents(parsed.data.tourDeposit);
      } catch {
        return { error: "Enter the deposit as a dollar amount, like 50" };
      }
      const result = await setTourDeposit({
        companyId: context.companyId,
        actor,
        tourId: parsed.data.tourId,
        depositCents,
      });
      if (!result.ok) return { error: result.error };
      depositNote = ` Deposit set to ${formatCents(depositCents)} on ${result.updated} date${result.updated === 1 ? "" : "s"}.`;
      revalidatePath("/label/shows");
    }

    revalidatePath("/label/tours");
    return { success: `Changes saved.${depositNote}` };
  } catch (err) {
    return fail(err);
  }
}

// ── Shows & opportunities ───────────────────────────────────────────────

const showSchema = z.object({
  showId: z.string().uuid().optional().or(z.literal("")),
  artistId: z.string().uuid("Pick an artist"),
  tourId: z.string().uuid().optional().or(z.literal("")),
  venueName: z.string().min(1, "Venue name is required").max(160),
  venueCity: z.string().min(1, "City is required").max(80),
  venueState: z.string().max(40),
  venueAddress: z.string().max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  doorsTime: z.string().optional().or(z.literal("")),
  startTime: z.string().optional().or(z.literal("")),
  ticketDeliveryMethod: z.enum(["will_call", "digital_transfer", "guest_list", "box_office"]),
  // opportunity fields
  depositPerTicket: z.string().min(1, "Set the deposit per ticket"),
  creatorPayment: z.string(),
  plusOneAllowed: z.string().optional(),
  ticketsTotal: z.coerce.number().int().min(1, "Offer at least 1 ticket").max(500),
  applicationDeadline: z.string().min(1, "Set an application deadline"),
  contentDeadlineDays: z.coerce.number().int().min(0).max(90),
  notes: z.string().max(1000),
  deliverables: z.string(), // JSON
  contentRequired: z.string().optional(),
  publish: z.string().optional(),
});

/**
 * Content is opt-in ("Require content" on the show forms). Off is attend-only:
 * no creator payment and nothing to post. On needs a payment, since a booking
 * requires content exactly when it's paid, and at least one thing to post.
 */
function contentTerms<D>(
  required: boolean,
  payment: string | undefined,
  deliverables: D[],
): { ok: true; creatorPaymentCents: number; deliverables: D[] } | { ok: false; error: string } {
  if (!required) return { ok: true, creatorPaymentCents: 0, deliverables: [] };
  let cents: number;
  try {
    cents = parseDollarsToCents(payment || "0");
  } catch {
    return { ok: false, error: "Enter dollar amounts like 120 or 120.50" };
  }
  if (cents < 100) return { ok: false, error: "Set what creators are paid for the content" };
  if (!deliverables.length) return { ok: false, error: "Add what creators should post" };
  return { ok: true, creatorPaymentCents: cents, deliverables };
}

const deliverablesSchema = z.array(
  z.object({
    platform: z.enum([
      "instagram_story", "instagram_reel", "instagram_post", "tiktok_video",
      "youtube_short", "youtube_video", "twitter_post", "other",
    ]),
    quantity: z.number().int().min(1).max(20),
    description: z.string().max(300),
  }),
).max(8);

export async function saveShowAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let showId = "";
  try {
    const context = await requireLabelWithCompany();
    const parsed = showSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const data = parsed.data;

    let deliverables: z.infer<typeof deliverablesSchema> = [];
    try {
      deliverables = deliverablesSchema.parse(JSON.parse(data.deliverables || "[]"));
    } catch {
      return { error: "Check the deliverables list" };
    }

    let statedTicketValueCents: number;
    try {
      statedTicketValueCents = parseDollarsToCents(data.depositPerTicket);
    } catch {
      return { error: "Enter dollar amounts like 120 or 120.50" };
    }
    const content = contentTerms(data.contentRequired === "on", data.creatorPayment, deliverables);
    if (!content.ok) return { error: content.error };

    const imageFile = formData.get("image");
    const showResult = await upsertShow({
      companyId: context.companyId,
      actor: { id: context.user.id, role: "label" },
      showId: data.showId || undefined,
      artistId: data.artistId,
      tourId: data.tourId || undefined,
      venue: {
        name: data.venueName,
        city: data.venueCity,
        state: data.venueState || undefined,
        address: data.venueAddress || undefined,
      },
      date: data.date,
      doorsTime: data.doorsTime || undefined,
      startTime: data.startTime || undefined,
      ticketDeliveryMethod: data.ticketDeliveryMethod,
      imageFile: imageFile instanceof File ? imageFile : null,
    });
    if (!showResult.ok) return { error: showResult.error };
    showId = showResult.showId;

    const oppResult = await upsertOpportunity({
      companyId: context.companyId,
      actor: { id: context.user.id, role: "label" },
      showId,
      statedTicketValueCents,
      depositPercentage: 100,
      creatorPaymentCents: content.creatorPaymentCents,
      plusOneAllowed: data.plusOneAllowed === "on",
      ticketsTotal: data.ticketsTotal,
      applicationDeadline: new Date(data.applicationDeadline).toISOString(),
      contentDeadlineDays: data.contentDeadlineDays,
      notes: data.notes,
      deliverables: content.deliverables,
      publish: data.publish === "true",
    });
    if (!oppResult.ok) return { error: oppResult.error };
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/label/shows");
  redirect(`/label/shows/${showId}?saved=1`);
}

// ── Bulk import: create + publish a show for every selected tour date ──────
const bulkImportSchema = z.object({
  ...artistFields,
  tourId: z.string().uuid().optional().or(z.literal("")).or(z.literal("none")),
  dates: z.string(), // JSON array of imported dates
  depositPerTicket: z.string().min(1, "Set the deposit per ticket"),
  creatorPayment: z.string(),
  ticketsTotal: z.coerce.number().int().min(1, "Offer at least 1 ticket").max(500),
  plusOneAllowed: z.string().optional(),
  deadlineDaysBefore: z.coerce.number().int().min(0).max(120),
  contentDeadlineDays: z.coerce.number().int().min(0).max(90),
  contentPlatform: z.enum([
    "none", "instagram_story", "instagram_reel", "instagram_post",
    "tiktok_video", "youtube_short", "youtube_video", "twitter_post", "other",
  ]),
  ticketDeliveryMethod: z.enum(["will_call", "digital_transfer", "guest_list", "box_office"]),
  contentRequired: z.string().optional(),
});

const importedDatesSchema = z
  .array(
    z.object({
      venueName: z.string().min(1).max(160),
      venueCity: z.string().min(1).max(80),
      venueState: z.string().max(40).optional().default(""),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      startTime: z.string().optional(),
    }),
  )
  .min(1, "Select at least one date to import")
  .max(60, "Import up to 60 dates at a time");

export async function bulkImportShowsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let created = 0;
  try {
    const context = await requireLabelWithCompany();
    const parsed = bulkImportSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const data = parsed.data;

    let dates: z.infer<typeof importedDatesSchema>;
    try {
      dates = importedDatesSchema.parse(JSON.parse(data.dates || "[]"));
    } catch (err) {
      return { error: err instanceof z.ZodError ? err.issues[0].message : "Select at least one date" };
    }

    let statedTicketValueCents: number;
    try {
      statedTicketValueCents = parseDollarsToCents(data.depositPerTicket);
    } catch {
      return { error: "Enter dollar amounts like 120 or 120.50" };
    }
    const content = contentTerms(
      data.contentRequired === "on",
      data.creatorPayment,
      data.contentPlatform === "none" ? [] : [{ platform: data.contentPlatform, quantity: 1, description: "" }],
    );
    if (!content.ok) return { error: content.error };

    const artist = await artistFromForm(data, context.companyId, { id: context.user.id, role: "label" });
    if (!artist.ok) return { error: artist.error };
    const artistId = artist.artistId;
    const tourId = data.tourId && data.tourId !== "none" ? data.tourId : undefined;

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    let firstError: string | null = null;

    // Dedup: skip any date this artist already has a show for at the same
    // venue+city (existing shows, plus dupes within this same batch).
    const { data: existingShows } = await serviceDb()
      .from("shows")
      .select("date, venues(name, city)")
      .eq("company_id", context.companyId)
      .eq("artist_id", artistId);
    const key = (date: string, venue: string, city: string) =>
      `${date}|${venue.trim().toLowerCase()}|${city.trim().toLowerCase()}`;
    const seen = new Set(
      (existingShows ?? []).map((s) =>
        key(s.date, s.venues?.name ?? "", s.venues?.city ?? ""),
      ),
    );

    for (const ev of dates) {
      // Skip dates already in the past — you can't publish a past opportunity.
      if (new Date(`${ev.date}T23:59:59`).getTime() < now) {
        firstError ??= `${ev.date} is in the past, skipped`;
        continue;
      }
      // Skip if this artist already has this exact date+venue.
      const evKey = key(ev.date, ev.venueName, ev.venueCity);
      if (seen.has(evKey)) {
        firstError ??= `${ev.date} at ${ev.venueName} already exists, skipped`;
        continue;
      }
      seen.add(evKey);

      const showResult = await upsertShow({
        companyId: context.companyId,
        actor: { id: context.user.id, role: "label" },
        artistId,
        tourId,
        venue: { name: ev.venueName, city: ev.venueCity, state: ev.venueState || undefined },
        date: ev.date,
        startTime: ev.startTime || undefined,
        ticketDeliveryMethod: data.ticketDeliveryMethod,
      });
      if (!showResult.ok) {
        firstError ??= `${ev.date}: ${showResult.error}`;
        continue;
      }
      // Applications close N days before each show, but never in the past.
      const dl = new Date(`${ev.date}T20:00:00`);
      dl.setDate(dl.getDate() - data.deadlineDaysBefore);
      const applicationDeadline = new Date(Math.max(dl.getTime(), now + dayMs)).toISOString();

      const oppResult = await upsertOpportunity({
        companyId: context.companyId,
        actor: { id: context.user.id, role: "label" },
        showId: showResult.showId,
        statedTicketValueCents,
        depositPercentage: 100,
        creatorPaymentCents: content.creatorPaymentCents,
        plusOneAllowed: data.plusOneAllowed === "on",
        ticketsTotal: data.ticketsTotal,
        applicationDeadline,
        contentDeadlineDays: data.contentDeadlineDays,
        deliverables: content.deliverables,
        publish: true,
      });
      if (!oppResult.ok) {
        firstError ??= `${ev.date}: ${oppResult.error}`;
        continue;
      }
      created += 1;
    }

    if (created === 0) return { error: firstError ?? "No shows were created." };
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/label/shows");
  redirect(`/label/shows?imported=${created}`);
}

// One-off pop-up: a standalone show (no tour) in a city, published instantly.
// Everything not asked here uses a sensible default.
const CONTENT_PLATFORMS = [
  "instagram_reel",
  "instagram_story",
  "instagram_post",
  "tiktok_video",
] as const;

const popupSchema = z.object({
  ...artistFields,
  venueName: z.string().min(1, "Venue name is required").max(160),
  venueCity: z.string().min(1, "City is required").max(80),
  venueState: z.string().max(40).optional(),
  venueAddress: z.string().max(200).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  ticketsTotal: z.coerce.number().int().min(1, "Offer at least 1 ticket").max(500),
  depositPerTicket: z.string().min(1, "Set the deposit per ticket"),
  creatorPayment: z.string().optional(),
  applicationDeadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a deadline date"),
  // A content platform, or "none"/"" for attend-only.
  contentPlatform: z.string().optional(),
  contentRequired: z.string().optional(),
});

export async function createPopupShowAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let showId = "";
  try {
    const context = await requireLabelWithCompany();
    const parsed = popupSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const data = parsed.data;
    const actor = { id: context.user.id, role: "label" as const };

    const artist = await artistFromForm(data, context.companyId, actor);
    if (!artist.ok) return { error: artist.error };
    const artistId = artist.artistId;

    let statedTicketValueCents: number;
    try {
      statedTicketValueCents = parseDollarsToCents(data.depositPerTicket);
    } catch {
      return { error: "Enter dollar amounts like 120 or 120.50" };
    }
    const platform = CONTENT_PLATFORMS.find((p) => p === data.contentPlatform);
    const content = contentTerms(
      data.contentRequired === "on",
      data.creatorPayment,
      platform ? [{ platform, quantity: 1, description: "" }] : [],
    );
    if (!content.ok) return { error: content.error };

    const showResult = await upsertShow({
      companyId: context.companyId,
      actor,
      artistId,
      tourId: undefined,
      venue: { name: data.venueName, city: data.venueCity, state: data.venueState || undefined, address: data.venueAddress || undefined },
      date: data.date,
      ticketDeliveryMethod: "guest_list",
      imageFile: null,
      hideVenueUntilApproved: formData.get("hideLocation") === "on",
    });
    if (!showResult.ok) return { error: showResult.error };
    showId = showResult.showId;

    const oppResult = await upsertOpportunity({
      companyId: context.companyId,
      actor,
      showId,
      statedTicketValueCents,
      depositPercentage: 100,
      creatorPaymentCents: content.creatorPaymentCents,
      plusOneAllowed: false,
      ticketsTotal: data.ticketsTotal,
      // Deadline is a date → treat as end of that day.
      applicationDeadline: new Date(`${data.applicationDeadline}T23:59:59`).toISOString(),
      contentDeadlineDays: 2,
      notes: "",
      deliverables: content.deliverables,
      publish: true,
    });
    if (!oppResult.ok) return { error: oppResult.error };
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/label/shows");
  revalidatePath("/label/tours");
  redirect(`/label/shows/${showId}?saved=1`);
}

export async function cancelShowAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await requireLabelWithCompany();
    await requireCompanyRole(context.companyId, "admin");
    const showId = z.string().uuid().parse(formData.get("showId"));
    const reason = z.string().min(3, "Give a short reason").max(300).parse(formData.get("reason"));
    const result = await cancelShow({
      showId,
      actor: { id: context.user.id, role: "label" },
      companyId: context.companyId,
      reason,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath("/label/shows");
    return { success: `Show canceled. ${result.canceledBookings} booking(s) released` };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteTourAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await requireLabelWithCompany();
    await requireCompanyRole(context.companyId, "admin");
    const tourId = z.string().uuid().parse(formData.get("tourId"));
    const result = await deleteTour({
      tourId,
      companyId: context.companyId,
      actor: { id: context.user.id, role: "label" },
    });
    if (!result.ok) return { error: result.error };
    revalidatePath("/label/tours");
    revalidatePath("/label/shows");
    return { success: "Tour deleted" };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteShowAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await requireLabelWithCompany();
    await requireCompanyRole(context.companyId, "admin");
    const showId = z.string().uuid().parse(formData.get("showId"));
    const result = await deleteShow({
      showId,
      actor: { id: context.user.id, role: "label" },
      companyId: context.companyId,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath("/label/shows");
    revalidatePath("/label/tours");
  } catch (err) {
    return fail(err);
  }
  // Deleted from its own page: there's nothing left to show, so go to Shows.
  if (formData.get("backToShows") === "1") redirect("/label/tours");
  return { success: "Deleted" };
}

// ── Invite creators to a show (offers) ──────────────────────────────────

/** Invites go out in the background (see queueOffers); this is what the label sees meanwhile. */
const sendingMessage = (count: number) =>
  `Sending ${count} invite${count === 1 ? "" : "s"}. You'll get a notification when they're out.`;

export async function sendOffersAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const context = await requireLabelWithCompany();
    const showId = z.string().uuid().parse(formData.get("showId"));
    const creatorIds = z.array(z.string().uuid()).parse(formData.getAll("creatorId"));
    const queued = await queueOffers({
      companyId: context.companyId,
      showId,
      creatorIds,
      reviewer: { id: context.user.id, role: "label" },
    });
    if (!queued.ok) return { error: queued.error };
    // Send once the response is out, so the label can move on right away.
    after(() => runOutboxNow([queued.key]));
    return { success: sendingMessage(queued.count) };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Creators tab: invite the selected creators to one show, with an optional
 * note posted in each invite's conversation.
 */
export async function inviteCreatorsAction(input: {
  showId: string;
  creatorIds: string[];
  message: string;
}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const context = await requireLabelWithCompany();
    const parsed = z
      .object({
        showId: z.string().uuid(),
        creatorIds: z.array(z.string().uuid()).min(1, "Pick at least one creator").max(100),
        message: z.string().max(2000),
      })
      .safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
    const queued = await queueOffers({
      companyId: context.companyId,
      showId: parsed.data.showId,
      creatorIds: parsed.data.creatorIds,
      reviewer: { id: context.user.id, role: "label" },
      message: parsed.data.message,
    });
    if (!queued.ok) return { ok: false, error: queued.error };
    after(() => runOutboxNow([queued.key]));
    return { ok: true, message: sendingMessage(queued.count) };
  } catch (err) {
    const failed = fail(err);
    return { ok: false, error: failed && "error" in failed ? failed.error : "Something went wrong" };
  }
}

/** Creators tab: everyone in a city not yet invited to the show, for "Select everyone in <city>". */
export async function creatorsInCityAction(cityKey: string, showId: string): Promise<{ id: string; name: string }[]> {
  const context = await requireLabelWithCompany();
  return creatorsInCity(z.string().max(120).parse(cityKey), {
    companyId: context.companyId,
    showId: z.string().uuid().parse(showId),
  });
}

// ── Request review ──────────────────────────────────────────────────────

export async function approveRequestAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await requireLabelWithCompany();
    const requestId = z.string().uuid().parse(formData.get("requestId"));
    const confirmedTickets = formData.get("confirmedTicketCount");
    const result = await approveRequest({
      requestId,
      reviewer: { id: context.user.id, role: "label" },
      companyId: context.companyId,
      confirmedTicketCount: confirmedTickets
        ? (z.coerce.number().pipe(z.union([z.literal(1), z.literal(2)])).parse(confirmedTickets) as 1 | 2)
        : undefined,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath("/label/messages");
    return { success: `Approved. The creator has ${result.acceptHours} hours to accept` };
  } catch (err) {
    return fail(err);
  }
}

export async function rejectRequestAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await requireLabelWithCompany();
    const requestId = z.string().uuid().parse(formData.get("requestId"));
    const result = await rejectRequest({
      requestId,
      reviewer: { id: context.user.id, role: "label" },
      companyId: context.companyId,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath("/label/messages");
    return { success: "Request declined" };
  } catch (err) {
    return fail(err);
  }
}

export async function waitlistRequestAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await requireLabelWithCompany();
    const requestId = z.string().uuid().parse(formData.get("requestId"));
    const result = await waitlistRequest({
      requestId,
      reviewer: { id: context.user.id, role: "label" },
      companyId: context.companyId,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath("/label/messages");
    return { success: "Moved to waitlist" };
  } catch (err) {
    return fail(err);
  }
}

// ── Booking management ──────────────────────────────────────────────────

export async function sendInstructionsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await requireLabelWithCompany();
    const bookingId = z.string().uuid().parse(formData.get("bookingId"));
    const instructions = z
      .string()
      .min(5, "Write the pickup / delivery instructions")
      .max(2000)
      .parse(formData.get("instructions"));
    const result = await sendTicketInstructions({
      bookingId,
      companyId: context.companyId,
      sender: { id: context.user.id, role: "label" },
      instructions,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath(`/label/bookings/${bookingId}`);
    return { success: "Instructions sent to the creator" };
  } catch (err) {
    return fail(err);
  }
}

export async function cancelBookingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await requireLabelWithCompany();
    await requireCompanyRole(context.companyId, "admin");
    const bookingId = z.string().uuid().parse(formData.get("bookingId"));
    const reason = z.string().min(3).max(300).parse(formData.get("reason"));
    // Scope check: booking must belong to this company.
    const { serviceDb } = await import("@/server/db/service");
    const { data: booking } = await serviceDb()
      .from("bookings")
      .select("company_id")
      .eq("id", bookingId)
      .single();
    if (booking?.company_id !== context.companyId) return { error: "Booking not found" };
    const result = await cancelBooking({
      bookingId,
      actor: { id: context.user.id, role: "label" },
      reason,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath(`/label/bookings/${bookingId}`);
    return { success: "Booking canceled and hold released" };
  } catch (err) {
    return fail(err);
  }
}

export async function approveAttendanceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await requireLabelWithCompany();
    const bookingId = z.string().uuid().parse(formData.get("bookingId"));
    const result = await approveAttendance({
      bookingId,
      reviewer: { id: context.user.id, role: "label" },
      companyId: context.companyId,
      reviewNote: z.string().max(500).parse(formData.get("reviewNote") ?? "") || undefined,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath(`/label/bookings/${bookingId}`);
    revalidatePath("/label/attendance");
    return { success: "Attendance approved. The creator's hold was released" };
  } catch (err) {
    return fail(err);
  }
}

/** One tap: this creator was at the show (no check-in needed). */
export async function markAttendedAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const context = await requireLabelWithCompany();
    const bookingId = z.string().uuid().parse(formData.get("bookingId"));
    const result = await markAttended({
      bookingId,
      companyId: context.companyId,
      reviewer: { id: context.user.id, role: "label" },
    });
    if (!result.ok) return { error: result.error };
    revalidatePath(`/label/bookings/${bookingId}`);
    revalidatePath("/label/shows", "layout");
    revalidatePath("/label/attendance");
    return { success: "Marked attended. Hold released" };
  } catch (err) {
    return fail(err);
  }
}

/** "Mark everyone attended" for a show. */
export async function markAllAttendedAction(formData: FormData): Promise<void> {
  const context = await requireLabelWithCompany();
  const showId = z.string().uuid().parse(formData.get("showId"));
  await markAllAttended({ showId, companyId: context.companyId, reviewer: { id: context.user.id, role: "label" } });
  revalidatePath(`/label/shows/${showId}`);
  revalidatePath("/label/attendance");
}

/** Company setting: release unreviewed check-ins automatically after 48 hours. */
export async function setAutoReleaseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const context = await requireLabelWithCompany();
    if (context.memberRole === "member") return { error: "Only an owner or admin can change this" };
    const enabled = formData.get("autoRelease") === "on";
    await serviceDb().from("companies").update({ auto_release_attendance: enabled }).eq("id", context.companyId);
    await audit({
      actorId: context.user.id,
      actorRole: "label",
      action: "company.set_auto_release",
      entityType: "company",
      entityId: context.companyId,
      companyId: context.companyId,
      metadata: { enabled },
    });
    revalidatePath("/label/settings");
    return { success: enabled ? "Automatic release is on" : "Automatic release is off" };
  } catch (err) {
    return fail(err);
  }
}

export async function rejectAttendanceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await requireLabelWithCompany();
    const bookingId = z.string().uuid().parse(formData.get("bookingId"));
    const reviewNote = z
      .string()
      .min(5, "Tell the creator why the proof was rejected")
      .max(500)
      .parse(formData.get("reviewNote"));
    const result = await rejectAttendance({
      bookingId,
      reviewer: { id: context.user.id, role: "label" },
      companyId: context.companyId,
      reviewNote,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath(`/label/bookings/${bookingId}`);
    revalidatePath("/label/attendance");
    return { success: "Attendance rejected. Booking moved to no-show review" };
  } catch (err) {
    return fail(err);
  }
}

export async function resolveNoShowAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await requireLabelWithCompany();
    await requireCompanyRole(context.companyId, "admin");
    const bookingId = z.string().uuid().parse(formData.get("bookingId"));
    const action = z.enum(["capture", "excuse"]).parse(formData.get("noShowAction"));
    const result = await resolveNoShow({
      bookingId,
      reviewer: { id: context.user.id, role: "label" },
      companyId: context.companyId,
      action,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath(`/label/bookings/${bookingId}`);
    return {
      success:
        action === "capture"
          ? "Hold captured for the no-show"
          : "Creator excused. Hold released without charge",
    };
  } catch (err) {
    return fail(err);
  }
}

export async function reviewContentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await requireLabelWithCompany();
    const bookingId = z.string().uuid().parse(formData.get("bookingId"));
    const submissionId = z.string().uuid().parse(formData.get("submissionId"));
    const decision = z
      .enum(["approved", "revision_requested", "rejected"])
      .parse(formData.get("decision"));
    const reviewNote = z.string().max(500).parse(formData.get("reviewNote") ?? "");
    if (decision !== "approved" && reviewNote.length < 5) {
      return { error: "Add a note for the creator explaining the decision" };
    }
    const result = await reviewContent({
      bookingId,
      submissionId,
      reviewer: { id: context.user.id, role: "label" },
      companyId: context.companyId,
      decision,
      reviewNote: reviewNote || undefined,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath(`/label/bookings/${bookingId}`);
    revalidatePath("/label/content");
    const charged = result.chargedCents ? ` ${formatCents(result.chargedCents)} charged to your card.` : "";
    return {
      success:
        decision === "approved"
          ? result.paid
            ? `Content approved.${charged} Creator payment released`
            : `Content approved.${charged}`
          : decision === "revision_requested"
            ? "Revision requested"
            : "Content rejected",
    };
  } catch (err) {
    return fail(err);
  }
}

export async function retryPayoutAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await requireLabelWithCompany();
    await requireCompanyRole(context.companyId, "admin");
    const bookingId = z.string().uuid().parse(formData.get("bookingId"));
    const { serviceDb } = await import("@/server/db/service");
    const { data: booking } = await serviceDb()
      .from("bookings")
      .select("company_id")
      .eq("id", bookingId)
      .single();
    if (booking?.company_id !== context.companyId) return { error: "Booking not found" };
    const result = await fundAndPayout(bookingId, { id: context.user.id, role: "label" });
    if (!result.ok) return { error: result.error };
    revalidatePath(`/label/bookings/${bookingId}`);
    return { success: "Creator payment released" };
  } catch (err) {
    return fail(err);
  }
}

// ── The label's card (pays for creator content when it's approved) ──────

const companyCardSchema = z.object({
  cardNumber: z.string().regex(/^[\d\s]{13,23}$/, "Enter a valid card number"),
  expMonth: z.coerce.number().int().min(1, "Month").max(12, "Month"),
  expYear: z.coerce.number().int().min(2024).max(2050),
  cvc: z.string().regex(/^\d{3,4}$/, "Enter the 3–4 digit CVC"),
});

export async function addCompanyCardAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const context = await requireLabelWithCompany();
    if (context.memberRole === "member") return { error: "Ask your company owner or an admin to add the card" };
    const parsed = companyCardSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const result = await attachCompanyPaymentMethod(context.companyId, context.user.id, parsed.data);
    if (!result.ok) return { error: result.error };
    revalidatePath("/label", "layout");
    return { success: "Card verified and saved" };
  } catch (err) {
    return fail(err);
  }
}

/** The label's card through Stripe's card setup (see startCardSetup). */
export async function startCompanyCardSetupAction(): Promise<{ clientSecret: string } | { error: string }> {
  try {
    const context = await requireLabelWithCompany();
    if (context.memberRole === "member") return { error: "Ask your company owner or an admin to add the card" };
    const result = await startCardSetup(context.user.id, { companyId: context.companyId });
    return result.ok ? { clientSecret: result.clientSecret } : { error: result.error };
  } catch (err) {
    const failed = fail(err);
    return failed && "error" in failed ? failed : { error: "Something went wrong" };
  }
}

export async function finishCompanyCardSetupAction(setupIntentId: string): Promise<ActionState> {
  try {
    const context = await requireLabelWithCompany();
    if (context.memberRole === "member") return { error: "Ask your company owner or an admin to add the card" };
    const id = z.string().startsWith("seti_").max(255).parse(setupIntentId);
    const result = await finishCardSetup(context.user.id, id, { companyId: context.companyId });
    if (!result.ok) return { error: result.error };
    revalidatePath("/label", "layout");
    return { success: "Card verified and saved" };
  } catch (err) {
    return fail(err);
  }
}
