import type { Metadata } from "next";
import { requireManagerPage } from "../require-manager";
import { NotificationsPage } from "@/components/notifications-page";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function ManagerNotificationsPage() {
  const ctx = await requireManagerPage();
  return <NotificationsPage userId={ctx.user.id} />;
}
