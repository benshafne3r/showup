import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getSessionUser, getMemberCompany } from "@/server/auth/guards";
import { unreadNotificationCount } from "@/server/services/notifications";
import { unreadMessageCount } from "@/server/services/messaging";
import { serviceDb } from "@/server/db/service";

export default async function LabelLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/label");
  if (user.status !== "active") redirect("/sign-in");
  if (user.role === "creator") redirect("/creator");
  if (user.role === "admin") redirect("/admin");

  const membership = await getMemberCompany(user.id);
  if (!membership) {
    // Only the onboarding page is reachable without a company; every other
    // label page calls requireLabelPage() which redirects there.
    return <>{children}</>;
  }
  if (membership.companies?.suspended_at) {
    redirect("/sign-in");
  }

  const [unreadNotifs, unreadMessages, pendingRequests] = await Promise.all([
    unreadNotificationCount(user.id),
    unreadMessageCount(user.id),
    serviceDb()
      .from("show_requests")
      .select("id", { count: "exact", head: true })
      .eq("company_id", membership.company_id)
      .eq("status", "pending")
      .then((r) => r.count ?? 0),
  ]);

  return (
    <AppShell
      roleLabel={membership.companies?.name ?? "Label"}
      homeHref="/label/tours"
      userName={user.fullName || user.email}
      notificationsHref="/label/notifications"
      unreadNotifications={unreadNotifs}
      navItems={[
        { href: "/label/tours", label: "Tours" },
        { href: "/label/requests", label: "Requests", badge: pendingRequests },
        { href: "/label/shows", label: "Shows" },
        { href: "/label/messages", label: "Messages", badge: unreadMessages },
        { href: "/label/payments", label: "Payments" },
        { href: "/label/settings", label: "Settings" },
      ]}
    >
      {children}
    </AppShell>
  );
}
