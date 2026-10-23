import type { Metadata } from "next";
import Link from "next/link";
import { userDb } from "@/server/db/server-client";
import { venueDetailsForCreator } from "@/server/services/venues";
import { requireCreator } from "@/server/auth/guards";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { BOOKING_STATUS_META, type BookingStatus } from "@/lib/statuses";
import { formatShowDate, timeUntil } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Pager } from "@/components/pager";
import { pageOf } from "@/lib/pagination";
import { Ticket } from "lucide-react";

export const metadata: Metadata = { title: "Bookings" };
export const dynamic = "force-dynamic";

const ACTIVE: BookingStatus[] = [
  "awaiting_acceptance",
  "awaiting_payment_method",
  "confirmed",
  "authorization_failed",
  "attended",
  "no_show_review",
  "disputed",
];

const LIST_PAGE = 25;

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ap?: string; hp?: string }>;
}) {
  const user = await requireCreator();
  const params = await searchParams;
  const activePage = pageOf(params.ap, LIST_PAGE);
  const historyPage = pageOf(params.hp, LIST_PAGE);
  const db = await userDb();
  const bookingList = () =>
    db
      .from("bookings")
      .select(
        `id, status, ticket_count, acceptance_deadline_at, creator_payment_cents,
         authorization_amount_cents, created_at,
         shows!inner(id, date, artists(name), venues(city))`,
        { count: "exact" },
      )
      .eq("creator_id", user.id)
      .order("created_at", { ascending: false });
  const [{ data: active, count: activeTotal }, { data: history, count: historyTotal }] = await Promise.all([
    bookingList().in("status", ACTIVE).range(activePage.from, activePage.to),
    bookingList().not("status", "in", `(${ACTIVE.join(",")})`).range(historyPage.from, historyPage.to),
  ]);

  const upcoming = active ?? [];
  const past = history ?? [];
  const venueOf = await venueDetailsForCreator(user.id, [...upcoming, ...past].map((b) => b.shows.id));

  const renderList = (items: typeof upcoming) => (
    <ul className="space-y-3">
      {items.map((booking) => {
        const meta = BOOKING_STATUS_META[booking.status as BookingStatus];
        return (
          <li key={booking.id}>
            <Link
              href={`/creator/bookings/${booking.id}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/50"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {booking.shows.artists?.name}{" "}
                  <span className="text-muted-foreground">
                    · {venueOf.get(booking.shows.id)?.name ?? "Secret location"}, {booking.shows.venues?.city}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatShowDate(booking.shows.date)} · {booking.ticket_count} ticket
                  {booking.ticket_count > 1 ? "s" : ""}
                  {booking.creator_payment_cents > 0
                    ? ` · earn ${formatCents(booking.creator_payment_cents)}`
                    : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 text-right">
                {booking.status === "awaiting_acceptance" ? (
                  <span className="text-xs font-medium text-amber-300">
                    {timeUntil(booking.acceptance_deadline_at)} left to accept
                  </span>
                ) : null}
                <StatusBadge {...meta} />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="space-y-8">
      <PageHeader title="Bookings" description="Upcoming shows and your full history." />
      {!activeTotal && !historyTotal ? (
        <EmptyState
          icon={Ticket}
          title="No bookings yet"
          description="When a team approves your request, your booking shows up here."
          action={
            <Button asChild>
              <Link href="/creator">Discover shows</Link>
            </Button>
          }
        />
      ) : (
        <>
          <section className="space-y-3" aria-label="Upcoming and active bookings">
            <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              Active &amp; upcoming
            </h2>
            {upcoming.length ? renderList(upcoming) : (
              <p className="text-sm text-muted-foreground">Nothing active right now.</p>
            )}
            <Pager page={activePage.page} size={LIST_PAGE} total={activeTotal ?? 0} basePath="/creator/bookings" params={params} pageKey="ap" />
          </section>
          {historyTotal ? (
            <section className="space-y-3" aria-label="Past bookings">
              <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                History
              </h2>
              {renderList(past)}
              <Pager page={historyPage.page} size={LIST_PAGE} total={historyTotal} basePath="/creator/bookings" params={params} pageKey="hp" />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
