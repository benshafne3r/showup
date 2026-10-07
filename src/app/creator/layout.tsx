import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { isPlatformOwner } from "@/server/auth/owner";
import { getSessionUser } from "@/server/auth/guards";
import { unreadNotificationCount } from "@/server/services/notifications";
import { unreadMessageCount } from "@/server/services/messaging";

export default async function CreatorLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/creator");
  if (user.status !== "active") redirect("/sign-in");
  if (user.role === "label") redirect("/label");
  if (user.role === "manager") redirect("/manager");
  if (user.role === "admin") redirect("/admin");

  const [unreadNotifs, unreadMessages] = await Promise.all([
    unreadNotificationCount(user.id),
    unreadMessageCount(user.id),
  ]);

  return (
    <AppShell
      viewingAs={user.viewedBy ? { name: user.fullName || user.email, role: user.role } : undefined}
      roleLabel="Creator"
      homeHref="/creator"
      userName={user.fullName || user.email}
      notificationsHref="/creator/notifications"
      unreadNotifications={unreadNotifs}
      navItems={[
        { href: "/creator", label: "Discover", exact: true },
        { href: "/creator/bookings", label: "Bookings" },
        { href: "/creator/messages", label: "Messages", badge: unreadMessages },
        { href: "/creator/payments", label: "Payments" },
        { href: "/creator/notifications", label: "Notifications", badge: unreadNotifs },
        { href: "/creator/settings", label: "Profile" },
        ...(isPlatformOwner(user.email) ? [{ href: "/owner", label: "Owner" }] : []),
      ]}
    >
      {children}
    </AppShell>
  );
}
