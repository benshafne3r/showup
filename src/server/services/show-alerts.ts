import "server-only";

import type { ServiceClient } from "@/server/db/service";
import { deliver } from "./notifications";
import { cityKey } from "@/lib/cities";
import { formatShowDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";

/**
 * "New show in your city" emails for creators who opted in
 * (creator_profiles.new_show_alerts). Runs from the scheduled job so a bulk
 * import becomes one email per creator, not one per show.
 *
 * Each opportunity is claimed (city_alerts_sent_at) before sending, so
 * overlapping job runs never announce the same show twice.
 */
export async function sendNewShowAlerts(db: ServiceClient): Promise<{ shows: number; alerts: number }> {
  const { data: due } = await db
    .from("show_opportunities")
    .select(
      `id, creator_payment_cents, application_deadline,
       shows!inner(id, date, status, hide_venue_until_approved, artists(name), venues(name, city))`,
    )
    .not("published_at", "is", null)
    .is("city_alerts_sent_at", null)
    .order("published_at", { ascending: true })
    .limit(50);
  if (!due?.length) return { shows: 0, alerts: 0 };

  const { data: claimed } = await db
    .from("show_opportunities")
    .update({ city_alerts_sent_at: new Date().toISOString() })
    .in("id", due.map((o) => o.id))
    .is("city_alerts_sent_at", null)
    .select("id");
  const claimedIds = new Set((claimed ?? []).map((c) => c.id));

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const open = due.filter(
    (o) =>
      claimedIds.has(o.id) &&
      o.shows.status === "published" &&
      o.shows.date >= today &&
      new Date(o.application_deadline) > now &&
      o.shows.venues?.city,
  );
  if (!open.length) return { shows: 0, alerts: 0 };

  // Group the new shows by normalized city.
  const byCity = new Map<string, { label: string; shows: typeof open }>();
  for (const opp of open) {
    const label = opp.shows.venues!.city;
    const key = cityKey(label);
    const group = byCity.get(key) ?? { label, shows: [] };
    group.shows.push(opp);
    byCity.set(key, group);
  }

  // Everyone who opted in, matched to a city the same way.
  const { data: subscribers } = await db
    .from("creator_profiles")
    .select("user_id, city, users!inner(status, role)")
    .eq("new_show_alerts", true)
    .not("onboarded_at", "is", null)
    .eq("users.status", "active")
    .eq("users.role", "creator");

  let alerts = 0;
  for (const sub of subscribers ?? []) {
    const group = byCity.get(cityKey(sub.city));
    if (!group) continue;
    const shows = [...group.shows].sort((a, b) => (a.shows.date < b.shows.date ? -1 : 1));
    const single = shows.length === 1 ? shows[0] : null;
    await deliver({
      userId: sub.user_id,
      type: "new_show_nearby",
      title: single
        ? `New show in ${group.label}: ${single.shows.artists?.name ?? "a new artist"}`
        : `${shows.length} new shows in ${group.label}`,
      body: single
        ? `${single.shows.artists?.name ?? "A new show"} on ${formatShowDate(single.shows.date)} just opened for creator requests. Turn these alerts off anytime in your Profile.`
        : `New opportunities just opened for creator requests near you. Turn these alerts off anytime in your Profile.`,
      link: single ? `/creator/shows/${single.shows.id}` : `/creator?city=${encodeURIComponent(group.label)}`,
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
    });
    alerts++;
    // Stay under the email provider's per-second rate limit.
    await new Promise((resolve) => setTimeout(resolve, 550));
  }
  return { shows: open.length, alerts };
}
