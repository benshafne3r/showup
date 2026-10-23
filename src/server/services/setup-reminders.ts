import "server-only";

import { serviceDb, type ServiceClient } from "@/server/db/service";
import { deliver } from "./notifications";
import { cityKey } from "@/lib/cities";
import { missingSetupStep, setupReminderDue, type SetupStep } from "@/lib/setup-reminders";

/**
 * "Finish your setup" emails: creators who signed up but haven't finished
 * their profile or added a card get a nudge 1 day and 4 days after sign-up
 * (two at most, accounts under 3 weeks old). The scheduler picks who's due
 * in SQL (schedule_due_jobs) and enqueues one job per person; this re-checks
 * their state when the job runs, so a creator who finished in between isn't
 * nudged.
 */
export async function sendSetupReminderTo(userId: string, dedupeKey: string, db: ServiceClient = serviceDb()) {
  const { data: user } = await db
    .from("users")
    .select("id, created_at, role, status, managed_profile, creator_profiles(city, onboarded_at)")
    .eq("id", userId)
    .maybeSingle();
  if (!user || user.role !== "creator" || user.status !== "active" || user.managed_profile) return { sent: false };

  const [{ count: cards }, { data: earlier }] = await Promise.all([
    db.from("payment_methods").select("id", { count: "exact", head: true }).eq("user_id", userId).is("agency_id", null),
    db.from("notifications").select("created_at").eq("user_id", userId).eq("type", "setup_reminder"),
  ]);
  const step = missingSetupStep({ onboarded: !!user.creator_profiles?.onboarded_at, hasCard: (cards ?? 0) > 0 });
  const sent = earlier?.length ?? 0;
  const lastSentAt = sent ? new Date(Math.max(...earlier!.map((n) => new Date(n.created_at).getTime()))) : null;
  if (!step || !setupReminderDue({ signedUpAt: new Date(user.created_at), remindersSent: sent, lastSentAt, now: new Date() })) {
    return { sent: false };
  }
  const city = user.creator_profiles?.city ?? "";
  const nearby = city ? await openShowsIn(city, db) : 0;
  await deliver({ userId, ...reminderCopy(step, sent, city, nearby), dedupeKey, strict: true });
  return { sent: true };
}

function reminderCopy(step: SetupStep, alreadySent: number, city: string, nearby: number) {
  const details = nearby > 0 ? [{ label: "Open near you", value: `${nearby} show${nearby === 1 ? "" : "s"} in ${city}` }] : [];
  if (step === "profile") {
    return {
      type: "setup_reminder" as const,
      title: alreadySent ? "Your ShowUp account is almost ready" : "Finish your ShowUp profile",
      body:
        "You're a couple of minutes away from requesting free tickets to shows near you. " +
        "Finish your profile, then add a card so you can accept tickets when a label says yes.",
      link: "/creator/onboarding",
      email: { details, ctaLabel: "Finish my profile" },
    };
  }
  return {
    type: "setup_reminder" as const,
    title: alreadySent ? "One step left to get free tickets" : "Add a card to get your first tickets",
    body:
      "You'll need a card on file to accept tickets once a label approves your request. " +
      "It's only used for a hold before the show, released when you check in. " +
      "You're only charged if you don't show up.",
    link: "/creator/payments",
    email: { details, ctaLabel: "Add a card" },
  };
}

/** Open opportunities (still taking requests) in a city. */
async function openShowsIn(city: string, db: ServiceClient): Promise<number> {
  const { data } = await db
    .from("show_opportunities")
    .select("id, shows!inner(date, status, venues!inner(city))")
    .not("published_at", "is", null)
    .gt("application_deadline", new Date().toISOString())
    .eq("shows.status", "published")
    .gte("shows.date", new Date().toISOString().slice(0, 10))
    .limit(1000);
  const key = cityKey(city);
  return (data ?? []).filter((o) => o.shows.venues && cityKey(o.shows.venues.city) === key).length;
}
