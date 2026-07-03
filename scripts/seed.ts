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
  const ownerId = await createUser(`label.owner@${DOMAIN}`, "Aria Chen", "label");
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
  const { data: company } = await db
    .from("companies")
    .insert({
      name: "Midnight Bloom Records", kind: "label",
      website: "https://midnightbloom.example.com",
      onboarded_at: iso(new Date()), verified_at: iso(new Date()),
    })
    .select("id").single();
  const companyId = company!.id;
  await db.from("company_members").insert([
    { company_id: companyId, user_id: ownerId, role: "owner" },
    { company_id: companyId, user_id: memberId, role: "member" },
  ]);

  const artistRows = [
    { name: "Neon Coast", genre: "Indie Pop", bio: "Shimmering synth-pop from the West Coast. 40M+ streams.", instagram_handle: "neoncoast" },
    { name: "Velvet Static", genre: "Alt Rock", bio: "Fuzzy guitars, velvet hooks. On tour behind their sophomore LP.", instagram_handle: "velvetstatic" },
    { name: "Luna Waves", genre: "Electronic", bio: "Late-night electronic sets that turn venues into oceans.", instagram_handle: "lunawaves" },
  ];
  const artistIds: string[] = [];
  for (const artist of artistRows) {
    const { data } = await db.from("artists").insert({ company_id: companyId, ...artist }).select("id").single();
    artistIds.push(data!.id);
  }
  const [neonCoastId, velvetStaticId, lunaWavesId] = artistIds;

  const venueDefs: Array<[string, string, string]> = [
    ["The Echoplex", "Los Angeles", "CA"],
    ["Great American Music Hall", "San Francisco", "CA"],
    ["Wonder Ballroom", "Portland", "OR"],
    ["The Crocodile", "Seattle", "WA"],
    ["Bluebird Theater", "Denver", "CO"],
    ["Lincoln Hall", "Chicago", "IL"],
    ["Bowery Ballroom", "New York", "NY"],
    ["Mohawk", "Austin", "TX"],
  ];
  const venueIds: Record<string, string> = {};
  for (const [name, city, state] of venueDefs) {
    const { data } = await db
      .from("venues")
      .insert({ name, city, state, country: "US", capacity: 500, created_by_company: companyId })
      .select("id").single();
    venueIds[city] = data!.id;
  }

  const { data: tour } = await db
    .from("tours")
    .insert({
      company_id: companyId, artist_id: neonCoastId,
      name: "Coastal Nights Tour 2026",
      description: "Neon Coast's headline run across North America.",
      starts_on: dateStr(daysFromNow(-12)), ends_on: dateStr(daysFromNow(75)),
    })
    .select("id").single();
  const tourId = tour!.id;

  // Shows: one past (completed booking), the rest upcoming across cities.
  type ShowDef = {
    key: string; artistId: string; tourId?: string; city: string;
    daysOut: number; status: "published" | "draft" | "completed";
    valueCents: number; pct: number; payCents: number; plusOne: boolean;
    tickets: number; deliverables: Array<{ platform: "instagram_story" | "instagram_reel" | "tiktok_video"; qty: number; desc: string }>;
  };
  const showDefs: ShowDef[] = [
    { key: "la_past", artistId: neonCoastId, tourId, city: "Los Angeles", daysOut: -10, status: "completed", valueCents: 9000, pct: 50, payCents: 15000, plusOne: true, tickets: 6, deliverables: [{ platform: "tiktok_video", qty: 1, desc: "One TikTok recap (≥30s) tagging @neoncoast" }] },
    { key: "la", artistId: neonCoastId, tourId, city: "Los Angeles", daysOut: 18, status: "published", valueCents: 10000, pct: 50, payCents: 15000, plusOne: true, tickets: 8, deliverables: [{ platform: "tiktok_video", qty: 1, desc: "One TikTok or Reel (≥30s) from the show, tag @neoncoast" }] },
    { key: "sf", artistId: neonCoastId, tourId, city: "San Francisco", daysOut: 22, status: "published", valueCents: 8500, pct: 25, payCents: 5000, plusOne: true, tickets: 6, deliverables: [{ platform: "instagram_story", qty: 3, desc: "3 IG Stories during the show with venue tag" }] },
    { key: "portland", artistId: neonCoastId, tourId, city: "Portland", daysOut: 26, status: "published", valueCents: 7500, pct: 25, payCents: 0, plusOne: false, tickets: 10, deliverables: [] },
    { key: "seattle", artistId: neonCoastId, tourId, city: "Seattle", daysOut: 3, status: "published", valueCents: 8000, pct: 75, payCents: 10000, plusOne: true, tickets: 6, deliverables: [{ platform: "instagram_reel", qty: 1, desc: "One Reel within 48h of the show" }] },
    { key: "denver", artistId: neonCoastId, tourId, city: "Denver", daysOut: 33, status: "published", valueCents: 7000, pct: 50, payCents: 7500, plusOne: true, tickets: 8, deliverables: [{ platform: "tiktok_video", qty: 1, desc: "TikTok recap with crowd energy" }] },
    { key: "chicago", artistId: neonCoastId, tourId, city: "Chicago", daysOut: 40, status: "published", valueCents: 9500, pct: 100, payCents: 25000, plusOne: true, tickets: 4, deliverables: [{ platform: "tiktok_video", qty: 1, desc: "TikTok (≥45s)" }, { platform: "instagram_story", qty: 2, desc: "2 IG Stories with ticket link sticker" }] },
    { key: "nyc", artistId: neonCoastId, tourId, city: "New York", daysOut: 47, status: "published", valueCents: 12000, pct: 50, payCents: 20000, plusOne: true, tickets: 6, deliverables: [{ platform: "instagram_reel", qty: 1, desc: "One Reel, tag @neoncoast + @boweryballroom" }] },
    { key: "austin", artistId: neonCoastId, tourId, city: "Austin", daysOut: 54, status: "published", valueCents: 6500, pct: 25, payCents: 5000, plusOne: false, tickets: 8, deliverables: [{ platform: "instagram_story", qty: 2, desc: "2 IG Stories from the pit" }] },
    { key: "velvet_la", artistId: velvetStaticId, city: "Los Angeles", daysOut: 12, status: "published", valueCents: 11000, pct: 50, payCents: 12500, plusOne: true, tickets: 5, deliverables: [{ platform: "instagram_reel", qty: 1, desc: "One Reel with a track from the encore" }] },
    { key: "luna_draft", artistId: lunaWavesId, city: "Denver", daysOut: 60, status: "draft", valueCents: 5000, pct: 25, payCents: 0, plusOne: false, tickets: 10, deliverables: [] },
  ];

  const shows: Record<string, { showId: string; oppId: string; def: ShowDef }> = {};
  for (const def of showDefs) {
    const showDate = daysFromNow(def.daysOut);
    const { data: show } = await db
      .from("shows")
      .insert({
        company_id: companyId, artist_id: def.artistId, tour_id: def.tourId ?? null,
        venue_id: venueIds[def.city], date: dateStr(showDate),
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
        application_deadline: iso(daysFromNow(Math.max(def.daysOut - 2, def.daysOut < 0 ? def.daysOut : 1))),
        content_deadline_days: 7,
        notes: def.payCents === 0 ? "Attend-only opportunity — no content required." : "",
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
    const artistName = artistRows.find((a) => artistIds[artistRows.indexOf(a)] === s.def.artistId)?.name ?? "Show";
    const { data: thread } = await db
      .from("message_threads")
      .insert({
        request_id: request!.id, creator_id: creatorId, company_id: companyId,
        subject: `${artistName} — ${s.def.city}`,
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
        content_deadline_at: contentRequired ? iso(daysFromNow(s.def.daysOut + 7)) : null,
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

  // 1. Pending: Jay → NYC (with a message exchange)
  const pendingReq = await makeRequest("nyc", jayId, "pending", 2,
    "I shoot NYC shows weekly — my Bowery recaps average 25k views. Would love to bring my editor as +1.");
  await db.from("messages").insert([
    { thread_id: pendingReq.threadId, sender_id: jayId, kind: "text", body: "Happy to share examples of past venue recaps if helpful!", read_by: [jayId] },
    { thread_id: pendingReq.threadId, sender_id: ownerId, kind: "text", body: "Thanks Jay — reviewing this week. Your Bowery work looks great.", read_by: [ownerId] },
  ]);
  await db.from("message_threads").update({ last_message_at: iso(new Date()) }).eq("id", pendingReq.threadId);

  // 2. Approved awaiting acceptance: Zoe → Chicago (100% deposit show)
  const approvedReq = await makeRequest("chicago", zoeId, "approved", 1,
    "Chicago is my city — I cover Lincoln Hall constantly and my audience is 70% local.", ownerId);
  const zoeBookingId = await makeBooking(approvedReq.requestId, "chicago", zoeId, "awaiting_acceptance", 1, { acceptanceHoursLeft: 20 });
  await db.from("notifications").insert({
    user_id: zoeId, type: "request_approved", title: "You're approved for Neon Coast!",
    body: "You have 24 hours to review the terms and secure your spot.",
    link: `/creator/bookings/${zoeBookingId}`,
  });

  // 3. Rejected: Leo → Austin
  await makeRequest("austin", leoId, "rejected", 1,
    "ATX local, would love to cover this.", memberId);
  await db.from("notifications").insert({
    user_id: leoId, type: "request_rejected", title: "Request update",
    body: "Your request for Neon Coast wasn't selected this time.", link: "/creator/requests",
  });

  // 4. Waitlisted: Ava → LA
  await makeRequest("la", avaId, "waitlisted", 2,
    "LA-based, 168k on TikTok. My last concert GRWM hit 300k views.");

  // 5. Confirmed upcoming: Mia → LA (hold scheduled, not yet placed)
  const miaReq = await makeRequest("la", miaId, "approved", 2,
    "This is exactly my audience — LA indie pop fans. Bringing my videographer as +1.", ownerId);
  const miaBookingId = await makeBooking(miaReq.requestId, "la", miaId, "confirmed", 2, { accepted: true });
  {
    const s = shows["la"];
    const holdCents = authorizationAmountCents(s.def.valueCents, 2, s.def.pct);
    const scheduledFor = daysFromNow(s.def.daysOut - 5);
    await db.from("authorization_records").insert({
      booking_id: miaBookingId, creator_id: miaId, company_id: companyId,
      payment_method_id: pmIds[miaId], status: "scheduled", amount_cents: holdCents,
      provider: "mock", scheduled_for: iso(scheduledFor),
    });
    await db.from("creator_payment_records").insert({
      booking_id: miaBookingId, creator_id: miaId, company_id: companyId,
      status: "pending_fulfillment", amount_cents: s.def.payCents, provider: "mock",
    });
    await db.from("bookings").update({
      ticket_instructions: "You're on the guest list under 'Mia Torres +1'. Arrive by 7:45 PM, west entrance, bring photo ID.",
      ticket_instructions_sent_at: iso(new Date()),
    }).eq("id", miaBookingId);
    await db.from("messages").insert([
      { thread_id: miaReq.threadId, sender_id: ownerId, kind: "ticket_instructions", body: "You're on the guest list under 'Mia Torres +1'. Arrive by 7:45 PM, west entrance, bring photo ID.", read_by: [ownerId] },
    ]);
    await db.from("message_threads").update({ last_message_at: iso(new Date()) }).eq("id", miaReq.threadId);
  }

  // 6. Completed: Mia → past LA show (attended + posted + paid, hold released)
  const pastReq = await makeRequest("la_past", miaId, "approved", 1,
    "Would love to kick the tour off with a recap!", ownerId);
  const pastBookingId = await makeBooking(pastReq.requestId, "la_past", miaId, "completed", 1,
    { attendance: "approved", content: "approved", accepted: true });
  {
    const s = shows["la_past"];
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
      scheduled_for: iso(daysFromNow(-15)), authorized_at: iso(daysFromNow(-15)),
      released_at: iso(daysFromNow(-9)), attempt_count: 1,
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
      paid_at: iso(daysFromNow(-8)),
    });
    await db.from("attendance_submissions").insert({
      booking_id: pastBookingId, creator_id: miaId, company_id: companyId,
      status: "approved", checked_in_at: iso(daysFromNow(-10)),
      note: "At the venue! Crowd shot attached.", proof_paths: [],
      reviewed_by: ownerId, reviewed_at: iso(daysFromNow(-9)),
    });
    await db.from("content_submissions").insert({
      booking_id: pastBookingId, creator_id: miaId, company_id: companyId,
      status: "approved", post_url: "https://www.tiktok.com/@miatorres.live/video/7301234567890",
      caption_note: "Recap hit 84k views in 48h!", proof_paths: [],
      submitted_at: iso(daysFromNow(-9)), reviewed_by: ownerId, reviewed_at: iso(daysFromNow(-8)),
    });
  }

  // 7. Disputed: Jay → Seattle (attendance rejected → dispute open)
  const disputeReq = await makeRequest("seattle", jayId, "approved", 1,
    "In Seattle that weekend for a shoot — perfect timing.", memberId);
  const disputeBookingId = await makeBooking(disputeReq.requestId, "seattle", jayId, "disputed", 1,
    { attendance: "disputed", accepted: true });
  {
    const s = shows["seattle"];
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
      scheduled_for: iso(daysFromNow(-2)), authorized_at: iso(daysFromNow(-2)), attempt_count: 1,
    });
    await db.from("creator_payment_records").insert({
      booking_id: disputeBookingId, creator_id: jayId, company_id: companyId,
      status: "disputed", amount_cents: s.def.payCents, provider: "mock",
    });
    await db.from("attendance_submissions").insert({
      booking_id: disputeBookingId, creator_id: jayId, company_id: companyId,
      status: "disputed", checked_in_at: iso(daysFromNow(0)),
      note: "Checked in late — venue photo attached.", proof_paths: [],
      reviewed_by: memberId, reviewed_at: iso(new Date()), review_note: "Photo doesn't show the show in progress.",
    });
    await db.from("disputes").insert({
      booking_id: disputeBookingId, company_id: companyId, creator_id: jayId,
      kind: "attendance", status: "open", opened_by: jayId,
      reason: "I was at the show — arrived during the opener because my train was delayed. Photo shows the Crocodile stage during Neon Coast's set.",
    });
    await db.from("notifications").insert({
      user_id: adminId, type: "dispute_opened", title: "New attendance dispute",
      body: "Jay Park disputes a rejected attendance at The Crocodile (Seattle).",
      link: "/admin/disputes",
    });
  }

  // 8. Withdrawn + expired extras for status coverage
  await makeRequest("sf", leoId, "withdrawn", 1, "Might be in SF that week — will confirm.");
  await makeRequest("denver", avaId, "expired", 1, "Denver girlies let's go");

  console.log("\nSeed complete ✅");
  console.log(`\nDemo password for all accounts: ${PASSWORD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
