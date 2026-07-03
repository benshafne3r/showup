import type { Metadata } from "next";
import { requireCreator } from "@/server/auth/guards";
import { NotificationsPage } from "@/components/notifications-page";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function CreatorNotificationsPage() {
  const user = await requireCreator();
  return <NotificationsPage userId={user.id} />;
}
