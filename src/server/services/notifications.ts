import "server-only";

import { serviceDb } from "@/server/db/service";
import { emailProvider } from "@/server/providers/email";
import { publicEnv } from "@/lib/env";
import { BRAND } from "@/lib/brand";
import type { Database } from "@/lib/database.types";

type NotificationType = Database["public"]["Enums"]["notification_type"];

export type NotifyInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  /** In-app path, e.g. /creator/bookings/123 */
  link?: string;
};

/**
 * Notification service: writes the in-app notification and sends a
 * best-effort email. Structured so SMS/push channels can be added behind
 * the same call later.
 */
export async function notify(input: NotifyInput): Promise<void> {
  const db = serviceDb();

  const { data: row, error } = await db
    .from("notifications")
    .insert({
      user_id: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? "",
      link: input.link ?? null,
    })
    .select("id")
    .single();
  if (error) {
    console.error("notification insert failed:", error.message);
    return;
  }

  // Email channel (best effort — never blocks the triggering action).
  const { data: user } = await db
    .from("users")
    .select("email, full_name")
    .eq("id", input.userId)
    .maybeSingle();
  if (!user?.email) return;

  const linkLine = input.link ? `\n\nOpen ${BRAND.name}: ${publicEnv.appUrl}${input.link}` : "";
  const result = await emailProvider().send({
    to: user.email,
    subject: `${BRAND.name} — ${input.title}`,
    text: `Hi ${user.full_name || "there"},\n\n${input.body || input.title}${linkLine}\n\n— The ${BRAND.name} team`,
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
  await notifyMany((members ?? []).map((m) => ({ ...input, userId: m.user_id })));
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
