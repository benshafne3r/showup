import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { isPlatformOwner } from "@/server/auth/owner";
import { getSessionUser } from "@/server/auth/guards";
import { getAgencyMembership } from "@/server/services/agencies";
import { unreadNotificationCount } from "@/server/services/notifications";
import { unreadMessageCount } from "@/server/services/messaging";
import { serviceDb } from "@/server/db/service";

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/manager");
  if (user.status !== "active") redirect("/sign-in");
  if (user.role === "creator") redirect("/creator");
  if (user.role === "label") redirect("/label");
  if (user.role === "admin") redirect("/admin");

  const membership = await getAgencyMembership(user.id);
  if (!membership?.agencies) {
    // Only onboarding is reachable without an agency; every other page calls
    // requireManagerPage() which redirects there.
    return <>{children}</>;
  }
  if (membership.agencies.suspended_at) redirect("/sign-in");

  const [unreadNotifs, unreadMessages, badges] = await Promise.all([
    unreadNotificationCount(user.id),
    unreadMessageCount(user.id),
    // Pending roster requests, and label invites/approvals the agency still
    // has to accept or pass, counted in SQL against the roster.
    serviceDb()
      .rpc("agency_badges", { p_agency_id: membership.agency_id })
      .then((r) => r.data?.[0]),
  ]);
  const pendingRequests = Number(badges?.pending_requests ?? 0);
  const waitingOnYou = Number(badges?.waiting_on_you ?? 0);

  return (
    <AppShell
      viewingAs={user.viewedBy ? { name: user.fullName || user.email, role: user.role } : undefined}
      roleLabel={membership.agencies.name}
      homeHref="/manager"
      userName={user.fullName || user.email}
      notificationsHref="/manager/notifications"
      unreadNotifications={unreadNotifs}
      navItems={[
        { href: "/manager", label: "Roster", exact: true, badge: waitingOnYou },
        { href: "/manager/shows", label: "Shows" },
        { href: "/manager/messages", label: "Messages", badge: pendingRequests + unreadMessages },
        { href: "/manager/payments", label: "Payments" },
        { href: "/manager/settings", label: "Settings" },
        ...(isPlatformOwner(user.email) ? [{ href: "/owner", label: "Owner" }] : []),
      ]}
    >
      {children}
    </AppShell>
  );
}
