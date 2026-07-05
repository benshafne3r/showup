/**
 * ShowUp demo-data seeder. DEV ONLY — wipes and recreates all demo data.
 *
 *   npm run seed
 *
 * Demo credentials (also in the README):
 *   admin@demo.showup.test         ShowUp!Demo1   (platform admin)
 *   label.owner@demo.showup.test   ShowUp!Demo1   (label owner)
 *   label.member@demo.showup.test  ShowUp!Demo1   (label teammate)
 *   creator.mia@demo.showup.test   ShowUp!Demo1   (creator, Los Angeles)
 *   creator.jay@demo.showup.test   ShowUp!Demo1   (creator, New York)
 *   creator.zoe@demo.showup.test   ShowUp!Demo1   (creator, Chicago)
 *   creator.leo@demo.showup.test   ShowUp!Demo1   (creator, Austin)
 *   creator.ava@demo.showup.test   ShowUp!Demo1   (creator, Los Angeles)
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { authorizationAmountCents } from "../src/lib/money";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const db = createClient<Database>(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PASSWORD = "ShowUp!Demo1";
const DOMAIN = "demo.showup.test";

const daysFromNow = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
};
const dateStr = (d: Date) => d.toISOString().slice(0, 10);
const iso = (d: Date) => d.toISOString();
/** "2026-10-13" + n days → Date (UTC noon to dodge timezone edges). */
const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
};

async function wipe() {
  console.log("Wiping existing data…");
  // Order matters: children before parents (bookings FKs are RESTRICT).
  const tables = [
    "disputes", "content_submissions", "attendance_submissions", "messages",
    "message_threads", "creator_payment_records", "authorization_records",
    "booking_tickets", "bookings", "request_tickets", "show_requests",
    "deliverable_requirements", "show_opportunities", "shows", "tours",
    "artists", "company_invites", "company_members", "companies",
    "payment_methods", "creator_social_accounts", "creator_profiles",
    "venues", "notifications", "audit_logs", "mock_payment_state",
    "webhook_events", "rate_limits",
  ] as const;
  for (const table of tables) {
    const { error } = await db.from(table).delete().gte("created_at", "1970-01-01");
    if (error) {
      // rate_limits has no created_at
      await db.from(table).delete().neq("key" as never, "");
    }
  }

  const { data: userList } = await db.auth.admin.listUsers({ perPage: 1000 });
  for (const user of userList?.users ?? []) {
    if (user.email?.endsWith(`@${DOMAIN}`)) {
      await db.auth.admin.deleteUser(user.id);
    }
  }
}

async function createUser(email: string, fullName: string, role: "creator" | "label" | "admin") {
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: role === "admin" ? "creator" : role },
  });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
  // The auth trigger mirrors into public.users; wait for it, then fix admin role.
  for (let i = 0; i < 20; i++) {
    const { data: row } = await db.from("users").select("id").eq("id", data.user.id).maybeSingle();
    if (row) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  if (role === "admin") {
    await db.from("users").update({ role: "admin" }).eq("id", data.user.id);
    await db.auth.admin.updateUserById(data.user.id, { user_metadata: { full_name: fullName, role: "admin" } });
  }
  console.log(`  user ${email} (${role})`);
  return data.user.id;
}

async function main() {
  await wipe();
  console.log("Creating users…");

  const adminId = await createUser(`admin@${DOMAIN}`, "Platform Admin", "admin");
  const ownerId = await createUser(`label.owner@${DOMAIN}`, "Ben Shafner", "label");
  const memberId = await createUser(`label.member@${DOMAIN}`, "Marcus Reid", "label");
  const miaId = await createUser(`creator.mia@${DOMAIN}`, "Mia Torres", "creator");
  const jayId = await createUser(`creator.jay@${DOMAIN}`, "Jay Park", "creator");
  const zoeId = await createUser(`creator.zoe@${DOMAIN}`, "Zoe Kim", "creator");
  const leoId = await createUser(`creator.leo@${DOMAIN}`, "Leo Martins", "creator");
  const avaId = await createUser(`creator.ava@${DOMAIN}`, "Ava Patel", "creator");

  console.log("Creating creator profiles…");
  const profiles: Array<{
    userId: string; city: string; bio: string; categories: string[];
    audience: number; views: number;
    socials: Array<{ platform: "instagram" | "tiktok" | "youtube"; handle: string; followers: number; avgViews: number }>;
  }> = [
    {
      userId: miaId, city: "Los Angeles",
      bio: "Concert vlogs and behind-the-scenes music content. I bring my audience to every show.",
      categories: ["music", "lifestyle"], audience: 182000, views: 45000,
      socials: [
        { platform: "tiktok", handle: "miatorres.live", followers: 145000, avgViews: 52000 },
        { platform: "instagram", handle: "mia.torres", followers: 37000, avgViews: 12000 },
      ],
    },
    {
      userId: jayId, city: "New York",
      bio: "NYC nightlife and live music photographer. Fast turnaround reels.",
      categories: ["music", "photography"], audience: 96000, views: 22000,
      socials: [
        { platform: "instagram", handle: "jayparkshoots", followers: 78000, avgViews: 19000 },
        { platform: "youtube", handle: "JayParkLive", followers: 18000, avgViews: 8000 },
      ],
    },
    {
      userId: zoeId, city: "Chicago",
      bio: "Midwest music scene coverage — indie, electronic, and everything loud.",
      categories: ["music"], audience: 54000, views: 15000,
      socials: [{ platform: "tiktok", handle: "zoe.hears", followers: 54000, avgViews: 15000 }],
    },
    {
      userId: leoId, city: "Austin",
      bio: "Live-music storyteller. SXSW regular. Authentic crowd energy clips.",
      categories: ["music", "travel"], audience: 33000, views: 9000,
      socials: [{ platform: "instagram", handle: "leomartins.atx", followers: 33000, avgViews: 9000 }],
    },
    {
      userId: avaId, city: "Los Angeles",
      bio: "Pop culture and concert fashion. GRWM + show recap combos that convert.",
      categories: ["music", "fashion"], audience: 210000, views: 61000,
      socials: [
        { platform: "tiktok", handle: "avapatel", followers: 168000, avgViews: 70000 },
        { platform: "instagram", handle: "ava.patel", followers: 42000, avgViews: 15000 },
      ],
    },
  ];
  for (const p of profiles) {
    const { data: profile } = await db
      .from("creator_profiles")
      .insert({
        user_id: p.userId, city: p.city, bio: p.bio, categories: p.categories,
        audience_size: p.audience, avg_views: p.views,
        example_work: [`https://tiktok.com/@example/video/1`, `https://instagram.com/p/example`] as never,
        onboarded_at: iso(new Date()),
      })
      .select("id").single();
    await db.from("creator_social_accounts").insert(
      p.socials.map((s) => ({
        profile_id: profile!.id, platform: s.platform, handle: s.handle,
        followers: s.followers, avg_views: s.avgViews,
        url: `https://${s.platform}.com/@${s.handle}`,
      })),
    );
  }

  console.log("Creating company, artists, venues, tour, shows…");
  // Demo artist photos (uploaded to the public artist-images bucket):
  // - Baby Keem: Wikimedia Commons "Baby Keem 2022.jpg" (CC BY 2.0)
  // - Ella Langley: Wikimedia Commons "Ella Langley in Concert 2025.jpg" (CC BY 4.0)
  const imageBase = `${url}/storage/v1/object/public/artist-images/demo`;
  const { data: company } = await db
    .from("companies")
    .insert({
      name: "Columbia Records", kind: "label",
      website: "https://www.columbiarecords.com",
      onboarded_at: iso(new Date()), verified_at: iso(new Date()),
    })
    .select("id").single();
  const companyId = company!.id;
  await db.from("company_members").insert([
    { company_id: companyId, user_id: ownerId, role: "owner" },
    { company_id: companyId, user_id: memberId, role: "member" },
  ]);

  // Two headliners carry the demo shows/bookings (with photos + real tours).
  const showArtists = [
    { name: "Baby Keem", genre: "Hip-Hop / Rap", bio: "Grammy-winning rapper and producer. Arena-ready sets with festival energy — on the road behind Ca$ino.", instagram_handle: "babykeem", image_url: `${imageBase}/baby-keem.jpg` },
    { name: "Ella Langley", genre: "Country", bio: "Alabama-born country star. Raw, honest songwriting and one of the loudest sing-along crowds in country music.", instagram_handle: "ellalangley", image_url: `${imageBase}/ella-langley.jpg` },
  ];
  // The rest of Columbia's active roster — real artists, listed for the label
  // (no demo shows attached; one carries the draft-show example below).
  const rosterArtists = [
    { name: "Adele", genre: "Pop / Soul", instagram_handle: "adele" },
    { name: "Beyoncé", genre: "R&B / Pop", instagram_handle: "beyonce" },
    { name: "Harry Styles", genre: "Pop / Rock", instagram_handle: "harrystyles" },
    { name: "Rosalía", genre: "Flamenco Pop", instagram_handle: "rosalia.vt" },
    { name: "The Kid LAROI", genre: "Hip-Hop / Pop", instagram_handle: "thekidlaroi" },
    { name: "Lil Nas X", genre: "Hip-Hop / Pop", instagram_handle: "lilnasx" },
    { name: "Dominic Fike", genre: "Alt / Indie", instagram_handle: "dominicfike" },
    { name: "AJR", genre: "Indie Pop", instagram_handle: "ajrbrothers" },
    { name: "Tyler Childers", genre: "Country / Americana", instagram_handle: "tylerchildersmusic" },
    { name: "Polo G", genre: "Hip-Hop / Rap", instagram_handle: "polo.capalot" },
    { name: "Måneskin", genre: "Rock", instagram_handle: "maneskinofficial" },
    { name: "John Mayer", genre: "Rock / Blues", instagram_handle: "johnmayer" },
    { name: "The Neighbourhood", genre: "Alt / Indie", instagram_handle: "thenbhd" },
    { name: "Mora", genre: "Reggaetón / Latin", instagram_handle: "mora" },
  ];

  const artistNameById: Record<string, string> = {};
  const artistIdByName: Record<string, string> = {};
  const allArtistRows = [
    ...showArtists,
    ...rosterArtists.map((r) => ({ ...r, bio: "", image_url: null as string | null })),
  ];
  for (const artist of allArtistRows) {
    const { data } = await db.from("artists").insert({ company_id: companyId, ...artist }).select("id, name").single();
    artistNameById[data!.id] = data!.name;
    artistIdByName[data!.name] = data!.id;
  }
  const babyKeemId = artistIdByName["Baby Keem"];
  const ellaLangleyId = artistIdByName["Ella Langley"];
  const draftArtistId = artistIdByName["Dominic Fike"];

  // Real venues from the two artists' announced 2026 tours.
  const venueDefs: Array<[string, string, string, string]> = [
    ["Shrine Expo Hall", "Los Angeles", "CA", "US"],
    ["WAMU Theater", "Seattle", "WA", "US"],
    ["L'Olympia", "Paris", "", "FR"],
    ["O2 Academy Brixton", "London", "", "GB"],
    ["TD Coliseum", "Hamilton", "ON", "CA"],
    ["M&T Bank Stadium", "Baltimore", "MD", "US"],
    ["Koka Booth Amphitheatre", "Cary", "NC", "US"],
    ["Moody Center", "Austin", "TX", "US"],
    ["Illinois State Fairgrounds", "Springfield", "IL", "US"],
    ["Prudential Center", "Newark", "NJ", "US"],
    ["Red Rocks Amphitheatre", "Morrison", "CO", "US"],
    ["The Greek Theatre", "Los Angeles", "CA", "US"],
    ["Mission Ballroom", "Denver", "CO", "US"],
  ];
  const venueIds: Record<string, string> = {};
  for (const [name, city, state, country] of venueDefs) {
    const { data } = await db
      .from("venues")
      .insert({ name, city, state: state || null, country, created_by_company: companyId })
      .select("id").single();
    venueIds[name] = data!.id;
  }

  // Real 2026 tours (dates sourced from the artists' public announcements).
  const { data: keemTour } = await db
    .from("tours")
    .insert({
      company_id: companyId, artist_id: babyKeemId,
      name: "The Ca$ino Tour 2026",
      description: "Baby Keem's world tour supporting his second album Ca$ino — North America, Europe & UK.",
      starts_on: "2026-04-15", ends_on: "2026-09-18",
    })
    .select("id").single();
  const keemTourId = keemTour!.id;

  const { data: ellaTour } = await db
    .from("tours")
    .insert({
      company_id: companyId, artist_id: ellaLangleyId,
      name: "The Dandelion Tour 2026",
      description: "Ella Langley's headline arena and amphitheater run across North America.",
      starts_on: "2026-05-07", ends_on: "2026-10-31",
    })
    .select("id").single();
  const ellaTourId = ellaTour!.id;

  // Real show dates from The Ca$ino Tour (Baby Keem) and The Dandelion Tour
  // (Ella Langley), as publicly announced. Past dates carry the completed /
  // disputed demo bookings; upcoming dates are open opportunities.
  type ShowDef = {
    key: string; artistId: string; tourId?: string; venue: string;
    date: string; status: "published" | "draft" | "completed";
    valueCents: number; pct: number; payCents: number; plusOne: boolean;
    tickets: number; notes?: string;
    deliverables: Array<{ platform: "instagram_story" | "instagram_reel" | "tiktok_video"; qty: number; desc: string }>;
  };
  const showDefs: ShowDef[] = [
    // Baby Keem — The Ca$ino Tour 2026
    { key: "keem_la_past", artistId: babyKeemId, tourId: keemTourId, venue: "Shrine Expo Hall", date: "2026-05-03", status: "completed", valueCents: 9500, pct: 50, payCents: 15000, plusOne: true, tickets: 6, deliverables: [{ platform: "tiktok_video", qty: 1, desc: "One TikTok recap (≥30s) tagging @babykeem" }] },
    { key: "keem_seattle", artistId: babyKeemId, tourId: keemTourId, venue: "WAMU Theater", date: "2026-05-13", status: "completed", valueCents: 8000, pct: 75, payCents: 10000, plusOne: true, tickets: 6, deliverables: [{ platform: "instagram_reel", qty: 1, desc: "One Reel within 48h of the show" }] },
    { key: "keem_paris", artistId: babyKeemId, tourId: keemTourId, venue: "L'Olympia", date: "2026-09-03", status: "published", valueCents: 12000, pct: 50, payCents: 20000, plusOne: true, tickets: 6, deliverables: [{ platform: "instagram_reel", qty: 1, desc: "One Reel from the show, tag @babykeem" }] },
    { key: "keem_london", artistId: babyKeemId, tourId: keemTourId, venue: "O2 Academy Brixton", date: "2026-09-18", status: "published", valueCents: 12500, pct: 50, payCents: 25000, plusOne: true, tickets: 4, deliverables: [{ platform: "tiktok_video", qty: 1, desc: "TikTok (≥45s) from the tour closer" }, { platform: "instagram_story", qty: 2, desc: "2 IG Stories with ticket link sticker" }] },
    // Ella Langley — The Dandelion Tour 2026
    { key: "ella_hamilton", artistId: ellaLangleyId, tourId: ellaTourId, venue: "TD Coliseum", date: "2026-07-16", status: "published", valueCents: 8500, pct: 25, payCents: 7500, plusOne: true, tickets: 8, deliverables: [{ platform: "instagram_story", qty: 3, desc: "3 IG Stories during the show with venue tag" }] },
    { key: "ella_baltimore", artistId: ellaLangleyId, tourId: ellaTourId, venue: "M&T Bank Stadium", date: "2026-07-18", status: "published", valueCents: 11000, pct: 50, payCents: 15000, plusOne: true, tickets: 8, notes: "Stadium date — direct support on Morgan Wallen's Still The Problem Tour.", deliverables: [{ platform: "tiktok_video", qty: 1, desc: "One TikTok (≥30s) from the show, tag @ellalangley" }] },
    { key: "ella_cary", artistId: ellaLangleyId, tourId: ellaTourId, venue: "Koka Booth Amphitheatre", date: "2026-07-24", status: "published", valueCents: 7500, pct: 25, payCents: 0, plusOne: false, tickets: 10, deliverables: [] },
    { key: "ella_austin", artistId: ellaLangleyId, tourId: ellaTourId, venue: "Moody Center", date: "2026-08-13", status: "published", valueCents: 9000, pct: 50, payCents: 12500, plusOne: true, tickets: 6, deliverables: [{ platform: "tiktok_video", qty: 1, desc: "TikTok recap with crowd energy" }] },
    { key: "ella_springfield", artistId: ellaLangleyId, tourId: ellaTourId, venue: "Illinois State Fairgrounds", date: "2026-08-21", status: "published", valueCents: 7000, pct: 100, payCents: 25000, plusOne: true, tickets: 4, deliverables: [{ platform: "tiktok_video", qty: 1, desc: "TikTok (≥45s)" }, { platform: "instagram_story", qty: 2, desc: "2 IG Stories with ticket link sticker" }] },
    { key: "ella_newark", artistId: ellaLangleyId, tourId: ellaTourId, venue: "Prudential Center", date: "2026-09-10", status: "published", valueCents: 12000, pct: 50, payCents: 20000, plusOne: true, tickets: 6, deliverables: [{ platform: "instagram_reel", qty: 1, desc: "One Reel, tag @ellalangley" }] },
    { key: "ella_redrocks", artistId: ellaLangleyId, tourId: ellaTourId, venue: "Red Rocks Amphitheatre", date: "2026-10-07", status: "published", valueCents: 13500, pct: 75, payCents: 17500, plusOne: true, tickets: 6, deliverables: [{ platform: "instagram_reel", qty: 1, desc: "One Reel — Red Rocks at golden hour, tag @ellalangley" }] },
    { key: "ella_la", artistId: ellaLangleyId, tourId: ellaTourId, venue: "The Greek Theatre", date: "2026-10-13", status: "published", valueCents: 11000, pct: 50, payCents: 15000, plusOne: true, tickets: 8, deliverables: [{ platform: "instagram_reel", qty: 1, desc: "One Reel with a song from the encore, tag @ellalangley" }] },
    // Draft example (unpublished opportunity)
    { key: "fike_draft", artistId: draftArtistId, venue: "Mission Ballroom", date: "2026-11-20", status: "draft", valueCents: 5000, pct: 25, payCents: 0, plusOne: false, tickets: 10, deliverables: [] },
  ];

  const shows: Record<string, { showId: string; oppId: string; def: ShowDef }> = {};
  for (const def of showDefs) {
    const { data: show } = await db
      .from("shows")
      .insert({
        company_id: companyId, artist_id: def.artistId, tour_id: def.tourId ?? null,
        venue_id: venueIds[def.venue], date: def.date,
        doors_time: "19:00", start_time: "20:00",
        status: def.status === "draft" ? "draft" : def.status === "completed" ? "completed" : "published",
        ticket_delivery_method: "guest_list",
      })
      .select("id").single();
    const { data: opp } = await db
      .from("show_opportunities")
      .insert({
        show_id: show!.id, company_id: companyId,
        stated_ticket_value_cents: def.valueCents, deposit_percentage: def.pct,
        creator_payment_cents: def.payCents, plus_one_allowed: def.plusOne,
        tickets_total: def.tickets,
        application_deadline: iso(addDays(def.date, -2)),
        content_deadline_days: 7,
        notes: def.notes ?? (def.payCents === 0 ? "Attend-only opportunity — no content required." : ""),
        published_at: def.status === "draft" ? null : iso(daysFromNow(-14)),
      })
      .select("id").single();
    if (def.deliverables.length) {
      await db.from("deliverable_requirements").insert(
        def.deliverables.map((d) => ({
          opportunity_id: opp!.id, platform: d.platform, quantity: d.qty, description: d.desc,
        })),
      );
    }
    shows[def.key] = { showId: show!.id, oppId: opp!.id, def };
  }

  console.log("Creating payment methods (mock)…");
  const pmIds: Record<string, string> = {};
  for (const [userId, last4] of [[miaId, "4242"], [jayId, "4242"], [zoeId, "4242"]] as const) {
    const providerMethodId = `pm_mock_seed_${userId.slice(0, 8)}`;
    await db.from("mock_payment_state").insert({
      id: providerMethodId, kind: "payment_method",
      state: { userId, brand: "visa", last4, expMonth: 12, expYear: 2030, declineAtAuthorize: false } as never,
    });
    const { data: pm } = await db
      .from("payment_methods")
      .insert({
        user_id: userId, provider: "mock", provider_method_id: providerMethodId,
        brand: "visa", last4, exp_month: 12, exp_year: 2030,
        verified_at: iso(new Date()), is_default: true,
      })
      .select("id").single();
    pmIds[userId] = pm!.id;
  }

  console.log("Creating requests, bookings, and history…");

  const makeRequest = async (
    key: string, creatorId: string,
    status: "pending" | "approved" | "rejected" | "waitlisted" | "expired" | "withdrawn",
    ticketCount: 1 | 2, message: string, decidedBy?: string,
  ) => {
    const s = shows[key];
    const { data: request } = await db
      .from("show_requests")
      .insert({
        opportunity_id: s.oppId, show_id: s.showId, company_id: companyId,
        creator_id: creatorId, status, ticket_count: ticketCount,
        includes_plus_one: ticketCount === 2, message,
        decided_at: ["approved", "rejected"].includes(status) ? iso(new Date()) : null,
        decided_by: decidedBy ?? null,
        waitlisted_at: status === "waitlisted" ? iso(new Date()) : null,
      })
      .select("id").single();
    await db.from("request_tickets").insert(
      Array.from({ length: ticketCount }, (_, i) => ({
        request_id: request!.id, kind: (i === 0 ? "primary" : "plus_one") as "primary" | "plus_one",
      })),
    );
    const artistName = artistNameById[s.def.artistId] ?? "Show";
    const { data: thread } = await db
      .from("message_threads")
      .insert({
        request_id: request!.id, creator_id: creatorId, company_id: companyId,
        subject: `${artistName} — ${s.def.venue}`,
      })
      .select("id").single();
    return { requestId: request!.id, threadId: thread!.id, show: s };
  };

  const makeBooking = async (
    requestId: string, showKey: string, creatorId: string,
    status: Database["public"]["Enums"]["booking_status"],
    ticketCount: 1 | 2,
    opts: {
      attendance?: Database["public"]["Enums"]["attendance_status"];
      content?: Database["public"]["Enums"]["content_status"];
      acceptanceHoursLeft?: number; accepted?: boolean;
    } = {},
  ) => {
    const s = shows[showKey];
    const holdCents = authorizationAmountCents(s.def.valueCents, ticketCount, s.def.pct);
    const contentRequired = s.def.payCents > 0;
    const { data: booking } = await db
      .from("bookings")
      .insert({
        request_id: requestId, opportunity_id: s.oppId, show_id: s.showId,
        company_id: companyId, creator_id: creatorId, status,
        stated_ticket_value_cents: s.def.valueCents, deposit_percentage: s.def.pct,
        authorization_amount_cents: holdCents, creator_payment_cents: s.def.payCents,
        ticket_count: ticketCount, includes_plus_one: ticketCount === 2,
        content_required: contentRequired,
        content_state: opts.content ?? (contentRequired ? "pending" : "not_required"),
        content_deadline_at: contentRequired ? iso(addDays(s.def.date, 7)) : null,
        attendance_state: opts.attendance ?? "not_started",
        acceptance_deadline_at: iso(new Date(Date.now() + (opts.acceptanceHoursLeft ?? 24) * 3600 * 1000)),
        accepted_at: opts.accepted ? iso(new Date()) : null,
        terms_accepted_at: opts.accepted ? iso(new Date()) : null,
        terms_version: opts.accepted ? "2026-07-v1" : null,
        completed_at: status === "completed" ? iso(new Date()) : null,
      })
      .select("id").single();
    await db.from("booking_tickets").insert(
      Array.from({ length: ticketCount }, (_, i) => ({
        booking_id: booking!.id,
        kind: (i === 0 ? "primary" : "plus_one") as "primary" | "plus_one",
        status: status === "completed" ? ("used" as const) : ("reserved" as const),
      })),
    );
    await db.rpc("reserve_tickets", { p_opportunity_id: s.oppId, p_count: ticketCount });
    return booking!.id;
  };

  // 1. Pending: Jay → Ella Langley @ Prudential Center, Newark (NYC metro)
  const pendingReq = await makeRequest("ella_newark", jayId, "pending", 2,
    "I shoot NYC-metro shows weekly — my arena recaps average 25k views. Would love to bring my editor as +1.");
  await db.from("messages").insert([
    { thread_id: pendingReq.threadId, sender_id: jayId, kind: "text", body: "Happy to share examples of past venue recaps if helpful!", read_by: [jayId] },
    { thread_id: pendingReq.threadId, sender_id: ownerId, kind: "text", body: "Thanks Jay — reviewing this week. Your arena work looks great.", read_by: [ownerId] },
  ]);
  await db.from("message_threads").update({ last_message_at: iso(new Date()) }).eq("id", pendingReq.threadId);

  // 2. Approved awaiting acceptance: Zoe → Ella Langley @ Illinois State Fairgrounds (100% deposit show)
  const approvedReq = await makeRequest("ella_springfield", zoeId, "approved", 1,
    "The Midwest is my beat — my audience is 70% regional and country crossover crushes on my page.", ownerId);
  const zoeBookingId = await makeBooking(approvedReq.requestId, "ella_springfield", zoeId, "awaiting_acceptance", 1, { acceptanceHoursLeft: 20 });
  await db.from("notifications").insert({
    user_id: zoeId, type: "request_approved", title: "You're approved for Ella Langley!",
    body: "You have 24 hours to review the terms and secure your spot.",
    link: `/creator/bookings/${zoeBookingId}`,
  });

  // 3. Rejected: Leo → Ella Langley @ Moody Center, Austin
  await makeRequest("ella_austin", leoId, "rejected", 1,
    "ATX local, would love to cover this.", memberId);
  await db.from("notifications").insert({
    user_id: leoId, type: "request_rejected", title: "Request update",
    body: "Your request for Ella Langley wasn't selected this time.", link: "/creator/requests",
  });

  // 4. Waitlisted: Ava → Ella Langley @ The Greek Theatre, LA
  await makeRequest("ella_la", avaId, "waitlisted", 2,
    "LA-based, 168k on TikTok. My last concert GRWM hit 300k views.");

  // 5. Confirmed upcoming: Mia → Ella Langley @ The Greek Theatre (hold scheduled, not yet placed)
  const miaReq = await makeRequest("ella_la", miaId, "approved", 2,
    "LA is home — my concert recaps hit hardest with local fans. Bringing my videographer as +1.", ownerId);
  const miaBookingId = await makeBooking(miaReq.requestId, "ella_la", miaId, "confirmed", 2, { accepted: true });
  {
    const s = shows["ella_la"];
    const holdCents = authorizationAmountCents(s.def.valueCents, 2, s.def.pct);
    const scheduledFor = addDays(s.def.date, -5);
    await db.from("authorization_records").insert({
      booking_id: miaBookingId, creator_id: miaId, company_id: companyId,
      payment_method_id: pmIds[miaId], status: "scheduled", amount_cents: holdCents,
      provider: "mock", scheduled_for: iso(scheduledFor),
    });
    await db.from("creator_payment_records").insert({
      booking_id: miaBookingId, creator_id: miaId, company_id: companyId,
      status: "pending_fulfillment", amount_cents: s.def.payCents, provider: "mock",
    });
    const instructions = "You're on the guest list under 'Mia Torres +1' at The Greek Theatre box office. Doors 7 PM — bring photo ID.";
    await db.from("bookings").update({
      ticket_instructions: instructions,
      ticket_instructions_sent_at: iso(new Date()),
    }).eq("id", miaBookingId);
    await db.from("messages").insert([
      { thread_id: miaReq.threadId, sender_id: ownerId, kind: "ticket_instructions", body: instructions, read_by: [ownerId] },
    ]);
    await db.from("message_threads").update({ last_message_at: iso(new Date()) }).eq("id", miaReq.threadId);
  }

  // 6. Completed: Mia → Baby Keem @ Shrine Expo Hall (attended + posted + paid, hold released)
  const pastReq = await makeRequest("keem_la_past", miaId, "approved", 1,
    "Would love to cover the LA stop of the Ca$ino Tour!", ownerId);
  const pastBookingId = await makeBooking(pastReq.requestId, "keem_la_past", miaId, "completed", 1,
    { attendance: "approved", content: "approved", accepted: true });
  {
    const s = shows["keem_la_past"];
    const holdCents = authorizationAmountCents(s.def.valueCents, 1, s.def.pct);
    const intentId = "pi_mock_seed_past";
    await db.from("mock_payment_state").insert({
      id: intentId, kind: "intent",
      state: { status: "released", amountCents: holdCents, methodId: `pm_mock_seed_${miaId.slice(0, 8)}`, idempotencyKey: "seed:past" } as never,
    });
    await db.from("authorization_records").insert({
      booking_id: pastBookingId, creator_id: miaId, company_id: companyId,
      payment_method_id: pmIds[miaId], status: "released", amount_cents: holdCents,
      provider: "mock", provider_intent_id: intentId, idempotency_key: "seed:past",
      scheduled_for: iso(addDays(s.def.date, -5)), authorized_at: iso(addDays(s.def.date, -5)),
      released_at: iso(addDays(s.def.date, 1)), attempt_count: 1,
    });
    const transferId = "tr_mock_seed_past";
    await db.from("mock_payment_state").insert({
      id: transferId, kind: "transfer",
      state: { status: "paid", creatorUserId: miaId, amountCents: s.def.payCents, idempotencyKey: "payout:seed:past" } as never,
    });
    await db.from("creator_payment_records").insert({
      booking_id: pastBookingId, creator_id: miaId, company_id: companyId,
      status: "paid", amount_cents: s.def.payCents, provider: "mock",
      provider_transfer_id: transferId, idempotency_key: "payout:seed:past",
      paid_at: iso(addDays(s.def.date, 2)),
    });
    await db.from("attendance_submissions").insert({
      booking_id: pastBookingId, creator_id: miaId, company_id: companyId,
      status: "approved", checked_in_at: iso(addDays(s.def.date, 0)),
      note: "At the Shrine! Crowd shot attached.", proof_paths: [],
      reviewed_by: ownerId, reviewed_at: iso(addDays(s.def.date, 1)),
    });
    await db.from("content_submissions").insert({
      booking_id: pastBookingId, creator_id: miaId, company_id: companyId,
      status: "approved", post_url: "https://www.tiktok.com/@miatorres.live/video/7301234567890",
      caption_note: "Recap hit 84k views in 48h!", proof_paths: [],
      submitted_at: iso(addDays(s.def.date, 1)), reviewed_by: ownerId, reviewed_at: iso(addDays(s.def.date, 2)),
    });
  }

  // 7. Disputed: Jay → Baby Keem @ WAMU Theater (attendance rejected → dispute open)
  const disputeReq = await makeRequest("keem_seattle", jayId, "approved", 1,
    "In Seattle that weekend for a shoot — perfect timing.", memberId);
  const disputeBookingId = await makeBooking(disputeReq.requestId, "keem_seattle", jayId, "disputed", 1,
    { attendance: "disputed", accepted: true });
  {
    const s = shows["keem_seattle"];
    const holdCents = authorizationAmountCents(s.def.valueCents, 1, s.def.pct);
    const intentId = "pi_mock_seed_dispute";
    await db.from("mock_payment_state").insert({
      id: intentId, kind: "intent",
      state: { status: "authorized", amountCents: holdCents, methodId: `pm_mock_seed_${jayId.slice(0, 8)}`, idempotencyKey: "seed:dispute" } as never,
    });
    await db.from("authorization_records").insert({
      booking_id: disputeBookingId, creator_id: jayId, company_id: companyId,
      payment_method_id: pmIds[jayId], status: "authorized", amount_cents: holdCents,
      provider: "mock", provider_intent_id: intentId, idempotency_key: "seed:dispute",
      scheduled_for: iso(addDays(s.def.date, -5)), authorized_at: iso(addDays(s.def.date, -5)), attempt_count: 1,
    });
    await db.from("creator_payment_records").insert({
      booking_id: disputeBookingId, creator_id: jayId, company_id: companyId,
      status: "disputed", amount_cents: s.def.payCents, provider: "mock",
    });
    await db.from("attendance_submissions").insert({
      booking_id: disputeBookingId, creator_id: jayId, company_id: companyId,
      status: "disputed", checked_in_at: iso(addDays(s.def.date, 0)),
      note: "Checked in late — venue photo attached.", proof_paths: [],
      reviewed_by: memberId, reviewed_at: iso(addDays(s.def.date, 1)), review_note: "Photo doesn't show the show in progress.",
    });
    await db.from("disputes").insert({
      booking_id: disputeBookingId, company_id: companyId, creator_id: jayId,
      kind: "attendance", status: "open", opened_by: jayId,
      reason: "I was at the show — arrived during the opener because my train was delayed. Photo shows the WAMU Theater stage during Baby Keem's set.",
    });
    await db.from("notifications").insert({
      user_id: adminId, type: "dispute_opened", title: "New attendance dispute",
      body: "Jay Park disputes a rejected attendance at WAMU Theater (Seattle).",
      link: "/admin/disputes",
    });
  }

  // 8. Withdrawn + expired extras for status coverage
  await makeRequest("ella_redrocks", leoId, "withdrawn", 1, "Might be in Colorado that week — will confirm.");
  await makeRequest("ella_redrocks", avaId, "expired", 1, "Red Rocks bucket list, let's go");

  console.log("\nSeed complete ✅");
  console.log(`\nDemo password for all accounts: ${PASSWORD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
