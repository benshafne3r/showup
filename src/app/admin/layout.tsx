import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getSessionUser } from "@/server/auth/guards";
import { serviceDb } from "@/server/db/service";
import { unreadNotificationCount } from "@/server/services/notifications";
import { serverEnv } from "@/lib/env";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/admin");
  if (user.role !== "admin") redirect(user.role === "label" ? "/label" : "/creator");
  if (user.status !== "active") redirect("/sign-in");

  const [unreadNotifs, openDisputes] = await Promise.all([
    unreadNotificationCount(user.id),
    serviceDb()
      .from("disputes")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "under_review"])
      .then((r) => r.count ?? 0),
  ]);

  return (
    <AppShell
      roleLabel="Platform Admin"
      homeHref="/admin"
      userName={user.fullName || user.email}
      notificationsHref="/admin/notifications"
      unreadNotifications={unreadNotifs}
      testModeBanner={serverEnv.paymentProvider === "mock"}
      navItems={[
        { href: "/admin", label: "Dashboard", exact: true },
        { href: "/admin/disputes", label: "Disputes", badge: openDisputes },
        { href: "/admin/users", label: "Users" },
        { href: "/admin/companies", label: "Companies" },
        { href: "/admin/shows", label: "Shows" },
        { href: "/admin/bookings", label: "Bookings" },
        { href: "/admin/payments", label: "Payments" },
        { href: "/admin/audit-logs", label: "Audit logs" },
        { href: "/admin/settings", label: "Settings" },
      ]}
    >
      {children}
    </AppShell>
  );
}
