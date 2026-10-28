import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { cityKey, MAJOR_CITIES } from "@/lib/cities";
import { CITY_STATE, showStateKey, stateKey } from "@/lib/us-states";
import { creatorCities, creatorDirectory, suggestCreatorsForShow } from "@/server/services/offers";
import { listThreadsFor } from "@/server/services/messaging-queries";
import { unreadMessageCount } from "@/server/services/messaging";
import { rosterPage } from "@/server/services/agencies";
import { db } from "./fixtures";

/**
 * Database-side filtering, pagination and totals: the SQL keys match the app's
 * matching rules, and every list keeps working (with true totals) past the
 * old in-app caps of 24 / 50 / 60 / 100 / 200 rows.
 */

const tag = randomUUID().slice(0, 8);
const created: string[] = [];
afterAll(async () => {
  // Fresh creators with no bookings can be removed; the rest is wiped by the seed.
  for (const id of created) await db.auth.admin.deleteUser(id);
});

const check = <T extends { error: { message: string } | null }>(r: T) => {
  if (r.error) throw new Error(r.error.message);
  return r;
};

/** `n` onboarded creators in a city, audience 1000 + i (so the order is known). */
async function creators(n: number, where: { city: string; region: string }, label: string, track = true) {
  const ids: string[] = [];
  for (let i = 0; i < n; i += 20) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(20, n - i) }, async (_, j) => {
        const { data, error } = await db.auth.admin.createUser({
          email: `${label}-${tag}-${i + j}@load.showup.test`,
          email_confirm: true,
          user_metadata: { full_name: `${label} ${i + j}` },
        });
        if (error || !data.user) throw new Error(error?.message ?? "create user");
        return data.user.id;
      }),
    );
    ids.push(...batch);
  }
  check(
    await db.from("creator_profiles").upsert(
      ids.map((user_id, i) => ({
        user_id,
        city: where.city,
        region: where.region,
        country: "US",
        audience_size: 1000 + i,
        onboarded_at: new Date().toISOString(),
        new_show_alerts: false,
      })),
      { onConflict: "user_id" },
    ),
  );
  if (track) created.push(...ids);
  return ids;
}

async function labelCompany() {
  const { data: owner } = await db.from("users").select("id").eq("email", "label.owner@demo.showup.test").single();
  const { data: member } = await db.from("company_members").select("company_id").eq("user_id", owner!.id).single();
  const { data: artist } = await db.from("artists").select("id").eq("company_id", member!.company_id).limit(1).single();
  return { ownerId: owner!.id, companyId: member!.company_id, artistId: artist!.id };
}

/** `n` open shows (published, taking requests) at a venue. */
async function openShows(n: number, venueId: string, opts: { hideVenue?: boolean } = {}) {
  const { companyId, artistId } = await labelCompany();
  const showIds = Array.from({ length: n }, () => randomUUID());
  const oppIds = Array.from({ length: n }, () => randomUUID());
  const date = (i: number) => new Date(Date.now() + (10 + i) * 86_400_000).toISOString().slice(0, 10);
  check(
    await db.from("shows").insert(
      showIds.map((id, i) => ({
        id,
        company_id: companyId,
        artist_id: artistId,
        venue_id: venueId,
        date: date(i),
        status: "published" as const,
        hide_venue_until_approved: !!opts.hideVenue,
      })),
    ),
  );
  check(
    await db.from("show_opportunities").insert(
      oppIds.map((id, i) => ({
        id,
        show_id: showIds[i],
        company_id: companyId,
        stated_ticket_value_cents: 1000,
        deposit_percentage: 100,
        tickets_total: 5,
        application_deadline: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        published_at: new Date().toISOString(),
        city_alerts_sent_at: new Date().toISOString(),
      })),
    ),
  );
  return { showIds, oppIds, companyId };
}

async function venue(city: string, state: string | null, name = `Hall ${tag}`) {
  return check(await db.from("venues").insert({ name, city, state }).select("id, city_key, state_key").single()).data!;
}

describe("SQL keys match the app's matching rules", () => {
  it("city and state keys agree with cityKey / stateKey / showStateKey", async () => {
    const cities = [
      ...MAJOR_CITIES,
      ...Object.keys(CITY_STATE),
      " los angeles, CA ",
      "LA",
      "L.A.",
      "NYC",
      "New York City",
      "new   york",
      "Washington D.C.",
      "dc",
      "St. Louis",
      "São Paulo",
      " LA\t",
      "Los Angeles",
      "Nowhere Town",
      ",",
    ];
    const states = [null, "", "CA", "ca", " California ", "new york", "New  York", "DC", "District of Columbia", "Ontario", "Tx\n"];
    const rows = cities.flatMap((city) => states.map((state) => ({ name: `Parity ${tag}`, city, state })));
    const { data: venues } = check(await db.from("venues").insert(rows).select("city, state, city_key, state_key"));
    try {
      for (const v of venues!) {
        expect([v.city, v.state, v.city_key]).toEqual([v.city, v.state, cityKey(v.city)]);
        expect([v.city, v.state, v.state_key]).toEqual([v.city, v.state, showStateKey(v)]);
      }
    } finally {
      await db.from("venues").delete().eq("name", `Parity ${tag}`);
    }
  });

  it("creator region keys agree with stateKey", async () => {
    const regions = ["California", " california ", "CA", "Ontario", "", "New  York", "texas\n"];
    const ids = await creators(regions.length, { city: `Region ${tag}`, region: "" }, "region");
    for (const [i, region] of regions.entries()) {
      check(await db.from("creator_profiles").update({ region }).eq("user_id", ids[i]));
    }
    const { data } = await db.from("creator_profiles").select("region, region_key").in("user_id", ids);
    for (const p of data!) expect([p.region, p.region_key]).toEqual([p.region, stateKey(p.region)]);
  });
});

describe("creator picks past the old caps", () => {
  it("pages through every creator in and near a city, biggest audience first, with true totals", async () => {
    const city = `Capville ${tag}`;
    const local = await creators(130, { city, region: "Oregon" }, "local");
    await creators(70, { city: `Nearby ${tag}`, region: "OR" }, "near");
    const v = await venue(city, "OR");
    const { showIds, companyId } = await openShows(1, v.id);

    const first = await suggestCreatorsForShow({ companyId, showId: showIds[0] });
    expect(first!.inCityTotal).toBe(130);
    expect(first!.nearbyTotal).toBeGreaterThanOrEqual(70);
    expect(first!.inCity).toHaveLength(60);
    const audiences = first!.inCity.map((c) => local.indexOf(c.id));
    expect(audiences).toEqual([...audiences].sort((a, b) => b - a)); // biggest (latest index) first

    const all = await suggestCreatorsForShow({ companyId, showId: showIds[0], limit: 600 });
    expect(new Set(all!.inCity.map((c) => c.id))).toEqual(new Set(local));

    // The Creators tab's master list: filtered to the city, with the true total.
    const directory = await creatorDirectory({ companyId, cityKey: cityKey(city), query: "", limit: 60 });
    expect(directory.total).toBe(130);
    expect(directory.creators).toHaveLength(60);
    expect((await creatorCities()).find((c) => c.key === cityKey(city))?.creators).toBe(130);
    const searched = await creatorDirectory({ companyId, cityKey: "", query: `local ${tag}`.slice(0, 5), limit: 600 });
    expect(searched.total).toBeGreaterThanOrEqual(130); // name search reaches past the first page
  });
});

describe("discover past one page", () => {
  it("filters by city in SQL, pages without gaps or repeats, and never matches a secret venue name", async () => {
    const city = `Pagetown ${tag}`;
    const open = await venue(city, "NV");
    const secret = await venue(city, "NV", `Secret Hall ${tag}`);
    const { showIds } = await openShows(30, open.id);
    const hidden = await openShows(1, secret.id, { hideVenue: true });

    const page = async (offset: number, query = "") =>
      check(await db.rpc("discover_shows", { p_city_key: cityKey(city), p_query: query, p_limit: 24, p_offset: offset })).data!;
    const [one, two] = [await page(0), await page(24)];
    expect(one).toHaveLength(24);
    expect(two).toHaveLength(7);
    expect(Number(one[0].total)).toBe(31);
    const seen = [...one, ...two].map((r) => r.show_id);
    expect(new Set(seen)).toEqual(new Set([...showIds, hidden.showIds[0]]));

    expect(await page(0, `Secret Hall ${tag}`)).toHaveLength(0);
    expect(Number((await page(0, `Hall ${tag}`))[0].total)).toBe(30);
  });
});

describe("inbox past the old caps", () => {
  it("pages 60 threads with true totals, unread flags and the unread badge", async () => {
    const { ownerId, companyId } = await labelCompany();
    const [creator] = await creators(1, { city: `Inbox ${tag}`, region: "" }, "inbox", false);
    const v = await venue(`Inbox ${tag}`, null);
    const { showIds, oppIds } = await openShows(60, v.id);
    const requestIds = oppIds.map(() => randomUUID());
    check(
      await db.from("show_requests").insert(
        requestIds.map((id, i) => ({
          id,
          opportunity_id: oppIds[i],
          show_id: showIds[i],
          company_id: companyId,
          creator_id: creator,
          status: "pending" as const,
          ticket_count: 1,
          includes_plus_one: false,
        })),
      ),
    );
    const threadIds = requestIds.map(() => randomUUID());
    const at = (i: number) => new Date(Date.now() - (60 - i) * 60_000).toISOString();
    check(
      await db.from("message_threads").insert(
        threadIds.map((id, i) => ({ id, request_id: requestIds[i], creator_id: creator, company_id: companyId, subject: `T${i}`, last_message_at: at(i) })),
      ),
    );
    // Every thread has one message from the label; the creator has read the first 10.
    check(
      await db.from("messages").insert(
        threadIds.map((thread_id, i) => ({
          thread_id,
          sender_id: ownerId,
          body: `hello ${i}`,
          read_by: i < 10 ? [ownerId, creator] : [ownerId],
          created_at: at(i),
        })),
      ),
    );

    const viewer = { id: creator, side: "creator" as const };
    const first = await listThreadsFor(viewer);
    const second = await listThreadsFor(viewer, { offset: 30 });
    expect(first.total).toBe(60);
    expect(first.threads).toHaveLength(30);
    expect(second.threads).toHaveLength(30);
    expect(first.threads[0].subject).toBe("T59"); // newest activity first
    expect(new Set([...first.threads, ...second.threads].map((t) => t.id))).toEqual(new Set(threadIds));
    const unread = [...first.threads, ...second.threads].filter((t) => t.unread);
    expect(unread).toHaveLength(50);
    expect(first.threads[0].lastMessagePreview).toBe("hello 59");
    expect(await unreadMessageCount(creator)).toBe(50);
  });
});

describe("money totals past the old caps", () => {
  it("sums every payment, not just the latest page", async () => {
    const { companyId } = await labelCompany();
    const { data: mia } = await db.from("users").select("id").eq("email", "creator.mia@demo.showup.test").single();
    const totals = async () => {
      const company = check(await db.rpc("company_payment_totals", { p_company_id: companyId })).data![0];
      const creator = check(await db.rpc("creator_paid_cents", { p_creator_id: mia!.id })).data!;
      return { company: Number(company.paid_cents), creator: Number(creator) };
    };
    const before = await totals();

    const v = await venue(`Ledger ${tag}`, null);
    const { showIds, oppIds } = await openShows(120, v.id);
    const requestIds = oppIds.map(() => randomUUID());
    const bookingIds = oppIds.map(() => randomUUID());
    const now = new Date().toISOString();
    check(
      await db.from("show_requests").insert(
        requestIds.map((id, i) => ({ id, opportunity_id: oppIds[i], show_id: showIds[i], company_id: companyId, creator_id: mia!.id, status: "approved" as const, ticket_count: 1, includes_plus_one: false })),
      ),
    );
    check(
      await db.from("bookings").insert(
        bookingIds.map((id, i) => ({
          id,
          request_id: requestIds[i],
          opportunity_id: oppIds[i],
          show_id: showIds[i],
          company_id: companyId,
          creator_id: mia!.id,
          status: "completed" as const,
          stated_ticket_value_cents: 1000,
          deposit_percentage: 100,
          authorization_amount_cents: 1000,
          creator_payment_cents: 100,
          ticket_count: 1,
          includes_plus_one: false,
          content_required: true,
          content_state: "approved" as const,
          attendance_state: "approved" as const,
          acceptance_deadline_at: now,
          accepted_at: now,
        })),
      ),
    );
    check(
      await db.from("creator_payment_records").insert(
        bookingIds.map((booking_id) => ({ booking_id, creator_id: mia!.id, company_id: companyId, status: "paid" as const, amount_cents: 100, provider: "mock", paid_at: now })),
      ),
    );

    const after = await totals();
    expect(after.company - before.company).toBe(12_000);
    expect(after.creator - before.creator).toBe(12_000);
  });
});

describe("roster past one page", () => {
  it("pages an agency roster by audience with the true total", async () => {
    const ids = await creators(75, { city: `Roster ${tag}`, region: "" }, "roster");
    const { data: agency } = check(await db.from("agencies").insert({ name: `Agency ${tag}` }).select("id").single());
    check(await db.from("agency_creators").insert(ids.map((creator_id) => ({ agency_id: agency!.id, creator_id }))));
    try {
      const one = await rosterPage(agency!.id, { limit: 60, offset: 0 });
      const two = await rosterPage(agency!.id, { limit: 60, offset: 60 });
      expect(one.total).toBe(75);
      expect(one.entries).toHaveLength(60);
      expect(two.entries).toHaveLength(15);
      const audiences = [...one.entries, ...two.entries].map((e) => e.audienceSize);
      expect(audiences).toEqual([...audiences].sort((a, b) => b - a));
      expect(new Set([...one.entries, ...two.entries].map((e) => e.creatorId))).toEqual(new Set(ids));
    } finally {
      await db.from("agencies").delete().eq("id", agency!.id);
    }
  });
});
