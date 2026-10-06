import Link from "next/link";
import { notFound } from "next/navigation";
import { requireManagerPage } from "../../require-manager";
import { isOnRoster } from "@/server/services/agencies";
import { serviceDb } from "@/server/db/service";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ATTENDANCE_STATUS_META,
  AUTHORIZATION_STATUS_META,
  BOOKING_STATUS_META,
  CONTENT_STATUS_META,
  CONTENT_VERIFICATION_META,
  CREATOR_PAYMENT_STATUS_META,
} from "@/lib/statuses";
import { formatDateTime, formatShowDateLong } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { ArrowLeft, ExternalLink, MessageSquare } from "lucide-react";

export const dynamic = "force-dynamic";

const compactNumber = new Intl.NumberFormat("en-US", { notation: "compact" });

/**
 * Read-only booking view for a roster creator. Accepting the booking (and the
 * card hold) and checking in stay with the creator; the manager follows
 * along and talks to the artist team in the thread.
 */
export default async function ManagerBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireManagerPage();
  const { id } = await params;
  const db = serviceDb();

  const { data: booking } = await db
    .from("bookings")
    .select(
      `id, status, request_id, creator_id, authorization_amount_cents, creator_payment_cents,
       ticket_count, includes_plus_one, content_required, content_deadline_at,
       acceptance_deadline_at, accepted_at, ticket_instructions, cancel_reason,
       shows!inner(date, artists(name), venues(name, city, address)),
       companies(name),
       users:users!creator_id(full_name),
       authorization_records(status, amount_cents, created_at),
       creator_payment_records(status, amount_cents, paid_at, failure_reason, payee_agency_id),
       attendance_submissions(status, created_at),
       content_submissions(id, status, post_url, submitted_at, verification_status, view_count)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (!booking || !(await isOnRoster(ctx.agencyId, booking.creator_id))) notFound();

  const { data: thread } = await db
    .from("message_threads")
    .select("id")
    .eq("request_id", booking.request_id)
    .maybeSingle();

  const creatorName = booking.users?.full_name ?? "Creator";
  const auth = [...(booking.authorization_records ?? [])].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
  const attendance = [...(booking.attendance_submissions ?? [])].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
  const payment = booking.creator_payment_records;
  const waitingOnCreator = ["awaiting_acceptance", "awaiting_payment_method"].includes(booking.status);

  return (
    <div className="space-y-6">
      <Link
        href={`/manager/creators/${booking.creator_id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> {creatorName}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {booking.shows.artists?.name} · {booking.shows.venues?.city}
          </h1>
          <p className="text-sm text-muted-foreground">
            {creatorName} · {formatShowDateLong(booking.shows.date)} · {booking.companies?.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge {...BOOKING_STATUS_META[booking.status]} />
          {thread ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/manager/messages/${thread.id}`}>
                <MessageSquare className="size-4" aria-hidden /> Message artist team
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {waitingOnCreator ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Waiting on {creatorName.split(" ")[0]} to accept the booking
          {booking.status === "awaiting_payment_method" ? " and add a card" : ""} from their own login —
          the ticket hold goes on their card. Accept by {formatDateTime(booking.acceptance_deadline_at)}.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tickets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              {booking.ticket_count} ticket{booking.ticket_count > 1 ? "s" : ""}
              {booking.includes_plus_one ? " (incl. +1)" : ""} ·{" "}
              {booking.shows.venues?.name}
              {booking.shows.venues?.address ? ` — ${booking.shows.venues.address}` : ""}
            </p>
            <p className="flex flex-wrap items-center gap-2">
              Card hold {formatCents(booking.authorization_amount_cents)}
              {auth ? <StatusBadge {...AUTHORIZATION_STATUS_META[auth.status]} /> : null}
            </p>
            {booking.ticket_instructions ? (
              <div className="rounded-lg border bg-muted/40 p-3 whitespace-pre-wrap">{booking.ticket_instructions}</div>
            ) : (
              <p className="text-muted-foreground">Ticket instructions not sent yet.</p>
            )}
            {booking.cancel_reason ? <p className="text-red-300">Canceled: {booking.cancel_reason}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Attendance &amp; content</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="flex flex-wrap items-center gap-2">
              Check-in
              <StatusBadge {...ATTENDANCE_STATUS_META[attendance?.status ?? "not_started"]} />
            </p>
            {booking.content_required ? (
              <>
                {booking.content_deadline_at ? (
                  <p className="text-muted-foreground">Content due {formatDateTime(booking.content_deadline_at)}</p>
                ) : null}
                {(booking.content_submissions ?? []).length === 0 ? (
                  <p className="text-muted-foreground">No content submitted yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {booking.content_submissions.map((c) => (
                      <li key={c.id} className="flex flex-wrap items-center gap-2">
                        <a href={c.post_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                          Post <ExternalLink className="size-3" aria-hidden />
                        </a>
                        <StatusBadge {...CONTENT_STATUS_META[c.status]} />
                        {c.verification_status !== "unchecked" ? (
                          <StatusBadge {...CONTENT_VERIFICATION_META[c.verification_status]} />
                        ) : null}
                        {c.view_count != null ? (
                          <span className="text-muted-foreground">{compactNumber.format(c.view_count)} views</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">Attend-only — no content required.</p>
            )}
          </CardContent>
        </Card>

        {booking.creator_payment_cents > 0 ? (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Payment</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2 text-sm">
              {formatCents(booking.creator_payment_cents)} for approved content, paid to {ctx.agencyName}
              {payment ? <StatusBadge {...CREATOR_PAYMENT_STATUS_META[payment.status]} /> : null}
              {payment?.paid_at ? <span className="text-muted-foreground">on {formatDateTime(payment.paid_at)}</span> : null}
              {payment?.failure_reason ? <span className="text-red-300">{payment.failure_reason}</span> : null}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
