import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/server/auth/guards";
import { serviceDb } from "@/server/db/service";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { formatCents } from "@/lib/money";
import { runJobsNowAction } from "./actions";
import { SubmitButton } from "@/components/submit-button";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  await requireAdmin();
  const db = serviceDb();

  const count = (table: "users" | "companies" | "shows" | "bookings" | "show_requests") =>
    db.from(table).select("id", { count: "exact", head: true }).then((r) => r.count ?? 0);

  const [users, companies, shows, bookings, requests, disputes, activeHolds, paidRows] =
    await Promise.all([
      count("users"),
      count("companies"),
      count("shows"),
      count("bookings"),
      count("show_requests"),
      db
        .from("disputes")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "under_review"])
        .then((r) => r.count ?? 0),
      db
        .from("authorization_records")
        .select("amount_cents")
        .eq("status", "authorized"),
      db.from("creator_payment_records").select("amount_cents").eq("status", "paid"),
    ]);

  const holdVolume = (activeHolds.data ?? []).reduce((s, r) => s + r.amount_cents, 0);
  const paidVolume = (paidRows.data ?? []).reduce((s, r) => s + r.amount_cents, 0);

  const stats = [
    { label: "Users", value: users, href: "/admin/users" },
    { label: "Companies", value: companies, href: "/admin/companies" },
    { label: "Shows", value: shows, href: "/admin/shows" },
    { label: "Requests", value: requests, href: "/admin/bookings" },
    { label: "Bookings", value: bookings, href: "/admin/bookings" },
    { label: "Open disputes", value: disputes, href: "/admin/disputes" },
    { label: "Active hold volume", value: formatCents(holdVolume), href: "/admin/payments" },
    { label: "Creator payouts made", value: formatCents(paidVolume), href: "/admin/payments" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform overview"
        action={
          <form action={runJobsNowAction}>
            <SubmitButton variant="outline" size="sm" pendingLabel="Running jobs…">
              Run scheduled jobs now
            </SubmitButton>
          </form>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="transition-colors hover:border-primary/50">
              <CardContent className="pt-6">
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        "Run scheduled jobs" processes acceptance expiries, due authorizations, grace-period
        cancellations, and reminders — the same work the cron endpoint does.
      </p>
    </div>
  );
}
