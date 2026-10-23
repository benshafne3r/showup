import "server-only";

import { createHash } from "node:crypto";
import { serviceDb } from "@/server/db/service";
import { deliver } from "./notifications";
import { cityKey } from "@/lib/cities";
import { formatShowDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import type { Json } from "@/lib/database.types";

/**
 * "New show in your city" emails for creators who opted in
 * (creator_profiles.new_show_alerts). Two job kinds:
 *  - city_alerts_fanout (scheduled every tick): picks newly published
 *    opportunities, groups them by city, and in ONE transaction marks them
 *    announced and enqueues one email job per subscriber (commit_city_alerts),
 *    so nothing is marked announced without its deliveries.
 *  - city_alert_email: sends one creator one email (paced by the worker),
 *    retried on failure, deduplicated by key.
 * A bulk import still becomes one email per creator, not one per show.
 */

const FANOUT_BATCH = 50;

export async function fanOutCityAlerts(): Promise<{ shows: number; alerts: number }> {
  const db = serviceDb();
  const { data: due, error } = await db
    .from("show_opportunities")
    .select("id, application_deadline, shows!inner(id, date, status, venues(city))")
    .not("published_at", "is", null)
    .is("city_alerts_sent_at", null)
    .order("published_at", { ascending: true })
    .limit(FANOUT_BATCH);
  if (error) throw new Error(`load new opportunities: ${error.message}`);
  if (!due?.length) return { shows: 0, alerts: 0 };

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const open = due.filter(
    (o) => o.shows.status === "published" && o.shows.date >= today && new Date(o.application_deadline) > now && o.shows.venues?.city,
  );

  // Group the new shows by normalized city.
  const byCity = new Map<string, { label: string; ids: string[] }>();
  for (const opp of open) {
    const label = opp.shows.venues!.city;
    const key = cityKey(label);
    const group = byCity.get(key) ?? { label, ids: [] };
    group.ids.push(opp.id);
    byCity.set(key, group);
  }

  const jobs: { kind: string; payload: Json; dedupe_key: string; priority: number }[] = [];
  if (byCity.size) {
    // Everyone who opted in, matched to a city the same way.
    const { data: subscribers, error: subError } = await db
      .from("creator_profiles")
      .select("user_id, city, users!inner(status, role, managed_profile)")
      .eq("new_show_alerts", true)
      .not("onboarded_at", "is", null)
      .eq("users.status", "active")
      .eq("users.role", "creator")
      .eq("users.managed_profile", false);
    if (subError) throw new Error(`load alert subscribers: ${subError.message}`);
    for (const sub of subscribers ?? []) {
      const group = byCity.get(cityKey(sub.city));
      if (!group) continue;
      const batch = createHash("sha1").update([...group.ids].sort().join(",")).digest("hex").slice(0, 16);
      jobs.push({
        kind: "city_alert_email",
        payload: { userId: sub.user_id, opportunityIds: group.ids, cityLabel: group.label },
        dedupe_key: `city_alert:${batch}:${sub.user_id}`,
        priority: 9,
      });
    }
  }

  // Claim every due opportunity (open or not, so closed ones don't linger)
  // together with the deliveries for the open ones.
  const { data: claimed, error: commitError } = await db.rpc("commit_city_alerts", {
    p_opportunity_ids: due.map((o) => o.id),
    p_jobs: jobs as unknown as Json,
  });
  if (commitError) throw new Error(`commit city alerts: ${commitError.message}`);
  return { shows: claimed ?? 0, alerts: claimed ? jobs.length : 0 };
}

export async function sendCityAlertEmail(p: { userId: string; opportunityIds: string[]; cityLabel: string }, dedupeKey: string) {
  const { data: opps, error } = await serviceDb()
    .from("show_opportunities")
    .select("id, creator_payment_cents, application_deadline, shows!inner(id, date, status, hide_venue_until_approved, artists(name), venues(name))")
    .in("id", p.opportunityIds);
  if (error) throw new Error(`load alert shows: ${error.message}`);
  const today = new Date().toISOString().slice(0, 10);
  const shows = (opps ?? [])
    .filter((o) => o.shows.status === "published" && o.shows.date >= today && new Date(o.application_deadline) > new Date())
    .sort((a, b) => (a.shows.date < b.shows.date ? -1 : 1));
  if (!shows.length) return; // all closed since; nothing worth emailing

  const single = shows.length === 1 ? shows[0] : null;
  await deliver({
    userId: p.userId,
    type: "new_show_nearby",
    title: single
      ? `New show in ${p.cityLabel}: ${single.shows.artists?.name ?? "a new artist"}`
      : `${shows.length} new shows in ${p.cityLabel}`,
    body: single
      ? `${single.shows.artists?.name ?? "A new show"} on ${formatShowDate(single.shows.date)} just opened for creator requests. Turn these alerts off anytime in your Profile.`
      : `New opportunities just opened for creator requests near you. Turn these alerts off anytime in your Profile.`,
    link: single ? `/creator/shows/${single.shows.id}` : `/creator?city=${encodeURIComponent(p.cityLabel)}`,
    email: {
      details: shows.map((o) => ({
        label: o.shows.artists?.name ?? "Show",
        value: [
          formatShowDate(o.shows.date),
          o.shows.hide_venue_until_approved ? "Secret location" : o.shows.venues?.name,
          o.creator_payment_cents > 0 ? `${formatCents(o.creator_payment_cents)} for content` : "attend only",
        ]
          .filter(Boolean)
          .join(" · "),
      })),
      ctaLabel: single ? "See the show" : "See shows",
    },
    dedupeKey,
    strict: true,
  });
}
