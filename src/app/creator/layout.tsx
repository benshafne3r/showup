import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getSessionUser } from "@/server/auth/guards";
import { unreadNotificationCount } from "@/server/services/notifications";
import { unreadMessageCount } from "@/server/services/messaging";
import { serverEnv } from "@/lib/env";

export default async function CreatorLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/creator");
  if (user.status !== "active") redirect("/sign-in");
  if (user.role === "label") redirect("/label");
  if (user.role === "admin") redirect("/admin");

  const [unreadNotifs, unreadMessages] = await Promise.all([
    unreadNotificationCount(user.id),
    unreadMessageCount(user.id),
  ]);

  return (
    <AppShell
      roleLabel="Creator"
      homeHref="/creator"
      userName={user.fullName || user.email}
      notificationsHref="/creator/notifications"
      unreadNotifications={unreadNotifs}
      testModeBanner={serverEnv.paymentProvider === "mock"}
      navItems={[
        { href: "/creator", label: "Discover", exact: true },
        { href: "/creator/requests", label: "My requests" },
        { href: "/creator/bookings", label: "Bookings" },
        { href: "/creator/messages", label: "Messages", badge: unreadMessages },
        { href: "/creator/payments", label: "Payments" },
        { href: "/creator/notifications", label: "Notifications", badge: unreadNotifs },
        { href: "/creator/settings", label: "Settings" },
      ]}
    >
      {children}
    </AppShell>
  );
}
