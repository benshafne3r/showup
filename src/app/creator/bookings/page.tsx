import type { Metadata } from "next";
import Link from "next/link";
import { userDb } from "@/server/db/server-client";
import { requireCreator } from "@/server/auth/guards";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { BOOKING_STATUS_META, type BookingStatus } from "@/lib/statuses";
import { formatShowDate, timeUntil } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Ticket } from "lucide-react";

export const metadata: Metadata = { title: "Bookings" };
export const dynamic = "force-dynamic";

const ACTIVE = [
  "awaiting_acceptance",
  "awaiting_payment_method",
  "confirmed",
  "authorization_failed",
  "attended",
  "no_show_review",
  "disputed",
];

export default async function BookingsPage() {
  const user = await requireCreator();
  const db = await userDb();
  const { data: bookings } = await db
    .from("bookings")
    .select(
      `id, status, ticket_count, acceptance_deadline_at, creator_payment_cents,
       authorization_amount_cents, created_at,
       shows!inner(date, artists(name), venues(name, city))`,
    )
    .eq("creator_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const upcoming = (bookings ?? []).filter((b) => ACTIVE.includes(b.status));
  const past = (bookings ?? []).filter((b) => !ACTIVE.includes(b.status));

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
                    · {booking.shows.venues?.name}, {booking.shows.venues?.city}
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
      {!bookings?.length ? (
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
          </section>
          {past.length > 0 ? (
            <section className="space-y-3" aria-label="Past bookings">
              <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                History
              </h2>
              {renderList(past)}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
