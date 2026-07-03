import type { Metadata } from "next";
import Link from "next/link";
import { requireLabelPage } from "./require-label";
import { serviceDb } from "@/server/db/service";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/money";
import { StatusBadge } from "@/components/status-badge";
import { BOOKING_STATUS_META } from "@/lib/statuses";
import { formatShowDate } from "@/lib/dates";
import { CalendarPlus, ClipboardCheck, Film, Inbox } from "lucide-react";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function LabelDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const context = await requireLabelPage();
  const params = await searchParams;
  const db = serviceDb();
  const companyId = context.companyId;

  const [
    pendingRequests,
    attendanceQueue,
    contentQueue,
    upcomingShows,
    bookings,
    spendRows,
  ] = await Promise.all([
    db
      .from("show_requests")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "pending")
      .then((r) => r.count ?? 0),
    db
      .from("attendance_submissions")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "submitted")
      .then((r) => r.count ?? 0),
    db
      .from("content_submissions")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "submitted")
      .then((r) => r.count ?? 0),
    db
      .from("shows")
      .select("id, date, status, artists(name), venues(name, city), show_opportunities(tickets_total, tickets_claimed)")
      .eq("company_id", companyId)
      .in("status", ["published", "postponed"])
      .gte("date", new Date().toISOString().slice(0, 10))
      .order("date")
      .limit(5),
    db
      .from("bookings")
      .select("id, status, created_at, creator_payment_cents, shows(date, artists(name)), users:users!creator_id(full_name)")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(6),
    db
      .from("creator_payment_records")
      .select("amount_cents, status")
      .eq("company_id", companyId),
  ]);

  const totalPaid = (spendRows.data ?? [])
    .filter((r) => r.status === "paid")
    .reduce((sum, r) => sum + r.amount_cents, 0);
  const committed = (spendRows.data ?? [])
    .filter((r) => ["pending_fulfillment", "ready"].includes(r.status))
    .reduce((sum, r) => sum + r.amount_cents, 0);

  const queues = [
    { label: "Pending requests", count: pendingRequests, href: "/label/requests", icon: Inbox },
    { label: "Attendance to verify", count: attendanceQueue, href: "/label/attendance", icon: ClipboardCheck },
    { label: "Content to review", count: contentQueue, href: "/label/content", icon: Film },
  ];

  return (
    <div className="space-y-6">
      {params.welcome ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300" role="status">
          Company created! Add your first artist, then create a show and publish the opportunity.
        </div>
      ) : null}
      <PageHeader
        title={context.companyName}
        description="Your creator campaigns at a glance."
        action={
          <Button asChild>
            <Link href="/label/shows/new">
              <CalendarPlus className="size-4" aria-hidden /> New show
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {queues.map((queue) => (
          <Link key={queue.href} href={queue.href}>
            <Card className="transition-colors hover:border-primary/50">
              <CardContent className="flex items-center justify-between pt-6">
                <div>
                  <p className="text-3xl font-bold">{queue.count}</p>
                  <p className="text-sm text-muted-foreground">{queue.label}</p>
                </div>
                <queue.icon className="size-6 text-primary" aria-hidden />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Campaign spend</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Creator payments made</span>
              <span className="font-semibold">{formatCents(totalPaid)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Committed (pending deliverables)</span>
              <span className="font-semibold">{formatCents(committed)}</span>
            </div>
            <Link href="/label/payments" className="inline-block pt-1 text-sm text-primary hover:underline">
              Full breakdown →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upcoming shows</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {upcomingShows.data?.length ? (
              upcomingShows.data.map((show) => {
                const opp = show.show_opportunities;
                return (
                  <Link
                    key={show.id}
                    href={`/label/shows/${show.id}`}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted"
                  >
                    <span className="truncate">
                      {show.artists?.name} · {show.venues?.city}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatShowDate(show.date)}
                      {opp ? ` · ${opp.tickets_claimed}/${opp.tickets_total} claimed` : ""}
                    </span>
                  </Link>
                );
              })
            ) : (
              <p className="text-muted-foreground">
                No upcoming shows.{" "}
                <Link href="/label/shows/new" className="text-primary hover:underline">
                  Create one
                </Link>
                .
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent bookings</CardTitle>
        </CardHeader>
        <CardContent>
          {bookings.data?.length ? (
            <ul className="divide-y">
              {bookings.data.map((booking) => (
                <li key={booking.id}>
                  <Link
                    href={`/label/bookings/${booking.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm hover:bg-muted/40"
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{booking.users?.full_name ?? "Creator"}</span>
                      <span className="text-muted-foreground">
                        {" "}· {booking.shows?.artists?.name} · {booking.shows?.date ? formatShowDate(booking.shows.date) : ""}
                      </span>
                    </span>
                    <StatusBadge {...BOOKING_STATUS_META[booking.status]} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Bookings appear here once you approve creator requests.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
