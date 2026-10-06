import { AppShell } from "@/components/app-shell";
import { requireOwnerPage } from "@/server/auth/owner";
import { unreadNotificationCount } from "@/server/services/notifications";

const PORTAL: Record<string, { home: string; notifications: string }> = {
  label: { home: "/label/tours", notifications: "/label/notifications" },
  manager: { home: "/manager", notifications: "/manager/notifications" },
  admin: { home: "/admin", notifications: "/admin" },
  creator: { home: "/creator", notifications: "/creator/notifications" },
};

/** Private owner dashboard: only the platform owner's accounts can open it. */
export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireOwnerPage();
  const portal = PORTAL[user.role] ?? PORTAL.creator;
  return (
    <AppShell
      roleLabel="Owner"
      homeHref="/owner"
      userName={user.fullName || user.email}
      notificationsHref={portal.notifications}
      unreadNotifications={await unreadNotificationCount(user.id)}
      navItems={[
        { href: "/owner", label: "Overview", exact: true },
        { href: portal.home, label: "My portal" },
      ]}
    >
      {children}
    </AppShell>
  );
}
