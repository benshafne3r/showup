import type { Metadata } from "next";
import { requireLabelPage } from "../require-label";
import { NotificationsPage } from "@/components/notifications-page";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function LabelNotificationsPage() {
  const context = await requireLabelPage();
  return <NotificationsPage userId={context.user.id} />;
}
