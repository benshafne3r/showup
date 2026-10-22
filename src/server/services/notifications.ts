import "server-only";

import { serviceDb } from "@/server/db/service";
import { emailProvider } from "@/server/providers/email";
import {
  emailExtrasText,
  notificationEmailHtml,
  type EmailExtras,
} from "@/server/providers/email/template";
import { publicEnv } from "@/lib/env";
import { BRAND } from "@/lib/brand";
import type { Database } from "@/lib/database.types";
import { managerLinkFor } from "@/lib/manager-links";
import { log } from "@/server/log";

type NotificationType = Database["public"]["Enums"]["notification_type"];

export type NotifyInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  /** In-app path, e.g. /creator/bookings/123 */
  link?: string;
  /** Extra email-only content (details table, quoted message, button label). */
  email?: EmailExtras;
  /**
   * Makes delivery idempotent: a retried job with the same key finds the
   * earlier notification and sends nothing again. Copies to other people
   * (management team, company members) derive their own keys from it.
   */
  dedupeKey?: string;
  /**
   * Throw when the notification can't be stored (background jobs set this so
   * they retry). Inline callers leave it off: a notification failure is
   * logged and never undoes the action that triggered it.
   */
  strict?: boolean;
};

const keyFor = (key: string | undefined, userId: string) => (key ? `${key}:${userId}` : undefined);

/**
 * Notification service: writes the in-app notification and sends a
 * best-effort email. Structured so SMS/push channels can be added behind
 * the same call later.
 *
 * A managed creator's management team is copied on everything the creator
 * is told (with links into the /manager portal), so they can stay on top of
 * requests, bookings and payouts for their roster.
 */
export async function notify(input: NotifyInput): Promise<void> {
  await deliver(input);
  await copyManagementTeam(input);
}

async function copyManagementTeam(input: NotifyInput): Promise<void> {
  const db = serviceDb();
  const { data: managed } = await db
    .from("agency_creators")
    .select("agency_id, users!agency_creators_creator_id_fkey(full_name)")
    .eq("creator_id", input.userId)
    .maybeSingle();
  if (!managed) return;
  const { data: members } = await db
    .from("agency_members")
    .select("user_id")
    .eq("agency_id", managed.agency_id);
  const creatorName = managed.users?.full_name || "Your creator";
  await Promise.all(
    (members ?? []).map((m) =>
      deliver({
        ...input,
        userId: m.user_id,
        title: `${creatorName}: ${input.title}`,
        link: managerLinkFor(input.link),
        dedupeKey: keyFor(input.dedupeKey ? `${input.dedupeKey}:copy` : undefined, m.user_id),
      }),
    ),
  );
}

/**
 * Write one in-app notification + send its email. No management copy.
 * Managed profiles (agency-run creators with no login) are skipped: their
 * agency already gets a copy of everything through notify().
 */
export async function deliver(input: NotifyInput): Promise<void> {
  const db = serviceDb();

  const { data: user } = await db
    .from("users")
    .select("email, full_name, managed_profile")
    .eq("id", input.userId)
    .maybeSingle();
  if (!user || user.managed_profile) return;

  const { data: row, error } = await db
    .from("notifications")
    .insert({
      user_id: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? "",
      link: input.link ?? null,
      dedupe_key: input.dedupeKey ?? null,
    })
    .select("id")
    .single();
  if (error?.code === "23505") return; // already delivered by an earlier attempt
  if (error) {
    if (input.strict) throw new Error(`notification insert failed: ${error.message}`);
    log.error("notification insert failed", { type: input.type, message: error.message });
    return;
  }

  // Email channel (best effort — never blocks the triggering action).
  if (!user.email) return;

  const href = input.link ? `${publicEnv.appUrl}${input.link}` : null;
  const linkLine = href ? `\n\nOpen ${BRAND.name}: ${href}` : "";
  const result = await emailProvider().send({
    to: user.email,
    subject: `${BRAND.name}: ${input.title}`,
    text: `Hi ${user.full_name || "there"},\n\n${input.body || input.title}${emailExtrasText(input.email)}${linkLine}\n\nThe ${BRAND.name} team`,
    html: notificationEmailHtml({
      name: user.full_name || "there",
      title: input.title,
      body: input.body || input.title,
      href,
      extras: input.email,
    }),
  });
  if (result.ok) {
    await db.from("notifications").update({ emailed_at: new Date().toISOString() }).eq("id", row.id);
  }
}

export async function notifyMany(inputs: NotifyInput[]): Promise<void> {
  await Promise.all(inputs.map((i) => notify(i)));
}

/** Notify every member of a company (e.g. new request, proof submitted). */
export async function notifyCompany(
  companyId: string,
  input: Omit<NotifyInput, "userId">,
): Promise<void> {
  const { data: members } = await serviceDb()
    .from("company_members")
    .select("user_id")
    .eq("company_id", companyId);
  await notifyMany((members ?? []).map((m) => ({ ...input, userId: m.user_id, dedupeKey: keyFor(input.dedupeKey, m.user_id) })));
}

export async function markNotificationRead(userId: string, notificationId: string): Promise<void> {
  await serviceDb()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", userId)
    .is("read_at", null);
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await serviceDb()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);
}

export async function unreadNotificationCount(userId: string): Promise<number> {
  const { count } = await serviceDb()
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);
  return count ?? 0;
}
