import type { Metadata } from "next";
import { requireAdmin } from "@/server/auth/guards";
import { NotificationsPage } from "@/components/notifications-page";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function AdminNotificationsPage() {
  const admin = await requireAdmin();
  return <NotificationsPage userId={admin.id} />;
}
