import "server-only";

import type { ServiceClient } from "@/server/db/service";
import { deliver } from "./notifications";
import { cityKey } from "@/lib/cities";
import {
  SETUP_REMINDER_DAYS,
  SETUP_REMINDER_WINDOW_DAYS,
  missingSetupStep,
  setupReminderDue,
  type SetupStep,
} from "@/lib/setup-reminders";

const DAY_MS = 86_400_000;
/** Per run; the email provider allows ~2 sends a second. */
const MAX_PER_RUN = 40;

/**
 * "Finish your setup" emails: creators who signed up but haven't finished
 * their profile or added a card get a nudge 1 day and 4 days after sign-up
 * (two at most, accounts under 3 weeks old). Deduplicated against the
 * notifications they've already been sent, so overlapping runs are safe.
 */
export async function sendSetupReminders(db: ServiceClient): Promise<{ sent: number }> {
  const now = new Date();
  const { data: creators } = await db
    .from("users")
    .select("id, created_at, creator_profiles(city, onboarded_at)")
    .eq("role", "creator")
    .eq("status", "active")
    .lt("created_at", new Date(now.getTime() - SETUP_REMINDER_DAYS[0] * DAY_MS).toISOString())
    .gt("created_at", new Date(now.getTime() - SETUP_REMINDER_WINDOW_DAYS * DAY_MS).toISOString())
    .order("created_at", { ascending: true })
    .limit(500);
  if (!creators?.length) return { sent: 0 };

  const ids = creators.map((c) => c.id);
  const [{ data: cards }, { data: earlier }] = await Promise.all([
    db.from("payment_methods").select("user_id").in("user_id", ids),
    db.from("notifications").select("user_id, created_at").eq("type", "setup_reminder").in("user_id", ids),
  ]);
  const withCard = new Set((cards ?? []).map((c) => c.user_id));
  const history = new Map<string, { count: number; last: Date }>();
  for (const n of earlier ?? []) {
    const prev = history.get(n.user_id);
    const at = new Date(n.created_at);
    history.set(n.user_id, { count: (prev?.count ?? 0) + 1, last: prev && prev.last > at ? prev.last : at });
  }

  const due = creators
    .map((c) => ({
      id: c.id,
      city: c.creator_profiles?.city ?? "",
      step: missingSetupStep({ onboarded: !!c.creator_profiles?.onboarded_at, hasCard: withCard.has(c.id) }),
      sent: history.get(c.id)?.count ?? 0,
      signedUpAt: new Date(c.created_at),
      lastSentAt: history.get(c.id)?.last ?? null,
    }))
    .filter(
      (c): c is typeof c & { step: SetupStep } =>
        c.step !== null &&
        setupReminderDue({ signedUpAt: c.signedUpAt, remindersSent: c.sent, lastSentAt: c.lastSentAt, now }),
    )
    .slice(0, MAX_PER_RUN);
  if (!due.length) return { sent: 0 };

  const openByCity = await openShowsByCity(db);
  let sent = 0;
  for (const creator of due) {
    const nearby = creator.city ? openByCity.get(cityKey(creator.city)) ?? 0 : 0;
    await deliver({ userId: creator.id, ...reminderCopy(creator.step, creator.sent, creator.city, nearby) });
    sent++;
    await new Promise((resolve) => setTimeout(resolve, 550));
  }
  return { sent };
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

/** Open opportunities (still taking requests) counted by normalized city. */
async function openShowsByCity(db: ServiceClient): Promise<Map<string, number>> {
  const { data } = await db
    .from("show_opportunities")
    .select("id, shows!inner(date, status, venues(city))")
    .not("published_at", "is", null)
    .gt("application_deadline", new Date().toISOString())
    .eq("shows.status", "published")
    .gte("shows.date", new Date().toISOString().slice(0, 10));
  const counts = new Map<string, number>();
  for (const opp of data ?? []) {
    const city = opp.shows.venues?.city;
    if (!city) continue;
    const key = cityKey(city);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
