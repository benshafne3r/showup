import { AppShell } from "@/components/app-shell";
import { requireOwnerPage } from "@/server/auth/owner";
import { unreadNotificationCount } from "@/server/services/notifications";
import { readViewAs } from "@/server/auth/view-as";
import { serviceDb } from "@/server/db/service";

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
  const viewing = await readViewAs();
  const { data: target } = viewing
    ? await serviceDb().from("users").select("full_name, email, role").eq("id", viewing.targetId).single()
    : { data: null };
  return (
    <AppShell
      viewingAs={target ? { name: target.full_name || target.email, role: target.role } : undefined}
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
