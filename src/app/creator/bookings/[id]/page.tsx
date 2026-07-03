import { notFound } from "next/navigation";
import Link from "next/link";
import { userDb } from "@/server/db/server-client";
import { requireCreator } from "@/server/auth/guards";
import { expireIfOverdue } from "@/server/services/bookings";
import { defaultPaymentMethod } from "@/server/services/payments";
import { TermsBreakdown } from "@/components/terms-breakdown";
import { StatusBadge } from "@/components/status-badge";
import {
  ATTENDANCE_STATUS_META,
  AUTHORIZATION_STATUS_META,
  BOOKING_STATUS_META,
  CONTENT_STATUS_META,
  CREATOR_PAYMENT_STATUS_META,
} from "@/lib/statuses";
import { formatShowDateLong, formatShowTime, formatDateTime, isShowDay, timeUntil } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AcceptFlow } from "./accept-flow";
import { AttendanceForm } from "./attendance-form";
import { ContentForm } from "./content-form";
import { DisputeDialog } from "./dispute-dialog";
import { RetryAuthorizationButton } from "./retry-authorization";
import { CalendarDays, Clock, MapPin, MessageSquare, TicketCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CreatorBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ confirmed?: string }>;
}) {
  const user = await requireCreator();
  const { id } = await params;
  const query = await searchParams;
  const db = await userDb();

  const load = () =>
    db
      .from("bookings")
      .select(
        `id, status, request_id, stated_ticket_value_cents, deposit_percentage,
         authorization_amount_cents, creator_payment_cents, ticket_count,
         includes_plus_one, content_required, content_state, content_deadline_at,
         attendance_state, acceptance_deadline_at, accepted_at, terms_accepted_at,
         ticket_instructions, ticket_instructions_sent_at, canceled_at, cancel_reason,
         completed_at, created_at,
         shows!inner(id, date, doors_time, start_time, status, artists(name), venues(name, city, state, address)),
         companies!inner(name),
         authorization_records(id, status, amount_cents, scheduled_for, authorized_at, released_at, captured_at, failure_reason, grace_deadline_at, created_at),
         creator_payment_records(status, amount_cents, paid_at, failure_reason),
         attendance_submissions(id, status, checked_in_at, note, review_note, created_at),
         content_submissions(id, status, post_url, caption_note, review_note, submitted_at),
         message_threads:request_id(id)`,
      )
      .eq("id", id)
      .eq("creator_id", user.id)
      .maybeSingle();

  let { data: booking } = await load();
  if (!booking) notFound();

  // Lazy expiry keeps the countdown honest even without the cron.
  if (await expireIfOverdue(booking)) {
    ({ data: booking } = await load());
    if (!booking) notFound();
  }

  const show = booking.shows;
  const artistName = show.artists?.name ?? "Show";
  const activeAuth = [...(booking.authorization_records ?? [])].sort(
    (a, b) => (a.created_at < b.created_at ? 1 : -1),
  )[0];
  const paymentRecord = booking.creator_payment_records;
  const attendance = [...(booking.attendance_submissions ?? [])].sort(
    (a, b) => (a.created_at < b.created_at ? 1 : -1),
  )[0];
  const contentSubmissions = [...(booking.content_submissions ?? [])].sort(
    (a, b) => (a.submitted_at < b.submitted_at ? 1 : -1),
  );

  const { data: thread } = await db
    .from("message_threads")
    .select("id")
    .eq("request_id", booking.request_id)
    .maybeSingle();

  const needsAcceptance = ["awaiting_acceptance", "awaiting_payment_method"].includes(booking.status);
  const paymentMethod = needsAcceptance ? await defaultPaymentMethod(user.id) : null;

  const canCheckIn =
    ["confirmed", "authorization_failed"].includes(booking.status) &&
    ["not_started", "rejected"].includes(booking.attendance_state) &&
    isShowDay(show.date);

  const canSubmitContent =
    booking.content_required &&
    ["confirmed", "attended"].includes(booking.status) &&
    ["pending", "revision_requested", "rejected"].includes(booking.content_state);

  // Activity timeline (simple derived list, newest first).
  const timeline: Array<{ at: string; label: string }> = [];
  timeline.push({ at: booking.created_at, label: "Request approved — booking created" });
  if (booking.accepted_at) timeline.push({ at: booking.accepted_at, label: "You accepted the terms" });
  if (activeAuth?.authorized_at) timeline.push({ at: activeAuth.authorized_at, label: `Temporary hold of ${formatCents(activeAuth.amount_cents)} placed` });
  if (activeAuth?.released_at) timeline.push({ at: activeAuth.released_at, label: "Hold released — you were not charged" });
  if (activeAuth?.captured_at) timeline.push({ at: activeAuth.captured_at, label: "Hold was charged (no-show)" });
  if (booking.ticket_instructions_sent_at) timeline.push({ at: booking.ticket_instructions_sent_at, label: "Ticket instructions sent" });
  if (attendance) timeline.push({ at: attendance.checked_in_at, label: "You checked in with attendance proof" });
  for (const submission of contentSubmissions) {
    timeline.push({ at: submission.submitted_at, label: "Content submitted for review" });
  }
  if (paymentRecord?.paid_at) timeline.push({ at: paymentRecord.paid_at, label: `Creator payment of ${formatCents(paymentRecord.amount_cents)} released` });
  if (booking.canceled_at) timeline.push({ at: booking.canceled_at, label: `Booking canceled${booking.cancel_reason ? ` — ${booking.cancel_reason}` : ""}` });
  if (booking.completed_at) timeline.push({ at: booking.completed_at, label: "Collaboration completed 🎉" });
  timeline.sort((a, b) => (a.at < b.at ? 1 : -1));

  return (
    <div className="space-y-6">
      {query.confirmed ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300" role="status">
          Booking confirmed! Attend the show and your hold is released. {booking.content_required ? "Post your content afterward to earn your payment." : ""}
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/creator/bookings" className="hover:underline">Bookings</Link> / {artistName}
          </p>
          <h1 className="text-2xl font-bold tracking-tight">{artistName}</h1>
          <p className="text-sm text-muted-foreground">
            Presented by {booking.companies.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge {...BOOKING_STATUS_META[booking.status]} />
          {thread ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/creator/messages/${thread.id}`}>
                <MessageSquare className="size-4" aria-hidden /> Message team
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardContent className="grid gap-3 pt-6 text-sm sm:grid-cols-2">
              <p className="flex items-center gap-2">
                <CalendarDays className="size-4 text-primary" aria-hidden />
                {formatShowDateLong(show.date)}
              </p>
              <p className="flex items-center gap-2">
                <Clock className="size-4 text-primary" aria-hidden />
                {formatShowTime(show.doors_time) ? `Doors ${formatShowTime(show.doors_time)}` : "Doors TBA"}
              </p>
              <p className="flex items-center gap-2 sm:col-span-2">
                <MapPin className="size-4 text-primary" aria-hidden />
                {show.venues?.name}, {show.venues?.city}
                {show.venues?.state ? `, ${show.venues.state}` : ""}
              </p>
            </CardContent>
          </Card>

          {needsAcceptance ? (
            <AcceptFlow
              bookingId={booking.id}
              deadline={booking.acceptance_deadline_at}
              hasVerifiedCard={!!paymentMethod}
              cardLabel={paymentMethod ? `${paymentMethod.brand.toUpperCase()} •••• ${paymentMethod.last4}` : null}
              holdCents={booking.authorization_amount_cents}
            />
          ) : null}

          {booking.status === "authorization_failed" && activeAuth?.status === "failed" ? (
            <Card className="border-red-500/40">
              <CardHeader>
                <CardTitle className="text-base text-red-300">Card hold failed</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>
                  {activeAuth.failure_reason ?? "We couldn't place the temporary hold on your card."}
                  {activeAuth.grace_deadline_at
                    ? ` Update your payment method before ${formatDateTime(activeAuth.grace_deadline_at)} or the booking will be canceled.`
                    : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href="/creator/payments">Update payment method</Link>
                  </Button>
                  <RetryAuthorizationButton bookingId={booking.id} />
                </div>
              </CardContent>
            </Card>
          ) : null}

          {booking.ticket_instructions ? (
            <Card className="border-primary/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TicketCheck className="size-4 text-primary" aria-hidden /> Ticket instructions
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap">{booking.ticket_instructions}</CardContent>
            </Card>
          ) : null}

          {/* Attendance track */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Attendance</CardTitle>
              <StatusBadge {...ATTENDANCE_STATUS_META[booking.attendance_state]} />
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {booking.attendance_state === "approved" ? (
                <p className="text-emerald-300">
                  Attendance verified — your hold {activeAuth?.status === "released" ? "was released" : "will be released"}. You were not charged.
                </p>
              ) : canCheckIn ? (
                <AttendanceForm bookingId={booking.id} />
              ) : booking.attendance_state === "submitted" ? (
                <p className="text-muted-foreground">
                  Proof submitted {attendance ? formatDateTime(attendance.checked_in_at) : ""} — waiting for the team to verify.
                </p>
              ) : booking.attendance_state === "rejected" ? (
                <div className="space-y-2">
                  <p className="text-red-300">
                    Your proof was not accepted{attendance?.review_note ? `: ${attendance.review_note}` : "."}
                  </p>
                  {isShowDay(show.date) ? <AttendanceForm bookingId={booking.id} resubmit /> : null}
                </div>
              ) : ["confirmed"].includes(booking.status) ? (
                <p className="text-muted-foreground">
                  Check-in opens on show day. Attending releases your {formatCents(booking.authorization_amount_cents)} hold.
                </p>
              ) : (
                <p className="text-muted-foreground">No attendance activity.</p>
              )}
            </CardContent>
          </Card>

          {/* Content track */}
          {booking.content_required ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Content deliverables</CardTitle>
                <StatusBadge {...CONTENT_STATUS_META[booking.content_state]} />
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {booking.content_deadline_at ? (
                  <p className="text-xs text-muted-foreground">
                    Deadline: {formatDateTime(booking.content_deadline_at)}
                  </p>
                ) : null}
                {contentSubmissions.length > 0 ? (
                  <ul className="space-y-2">
                    {contentSubmissions.map((submission) => (
                      <li key={submission.id} className="rounded-lg border bg-muted/40 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <a
                            href={submission.post_url}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate text-primary hover:underline"
                          >
                            {submission.post_url}
                          </a>
                          <StatusBadge {...CONTENT_STATUS_META[submission.status]} />
                        </div>
                        {submission.review_note ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Team note: {submission.review_note}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {canSubmitContent ? (
                  <ContentForm bookingId={booking.id} />
                ) : booking.content_state === "approved" ? (
                  <p className="text-emerald-300">
                    Content approved — {paymentRecord?.status === "paid" ? "your payment has been released!" : "payment is on its way."}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {/* Dispute */}
          {["no_show_review", "disputed", "attended", "confirmed", "canceled"].includes(booking.status) ||
          booking.attendance_state === "rejected" ||
          booking.content_state === "rejected" ? (
            <div className="flex justify-end">
              {booking.status !== "disputed" ? (
                <DisputeDialog bookingId={booking.id} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  A dispute is open on this booking — an administrator is reviewing it.
                </p>
              )}
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <TermsBreakdown
            statedTicketValueCents={booking.stated_ticket_value_cents}
            depositPercentage={booking.deposit_percentage}
            ticketCount={booking.ticket_count}
            authorizationAmountCents={booking.authorization_amount_cents}
            creatorPaymentCents={booking.creator_payment_cents}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Hold &amp; payment status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Temporary hold</span>
                <StatusBadge {...AUTHORIZATION_STATUS_META[activeAuth?.status ?? "not_scheduled"]} />
              </div>
              {activeAuth?.status === "scheduled" && activeAuth.scheduled_for ? (
                <p className="text-xs text-muted-foreground">
                  Will be placed {formatDateTime(activeAuth.scheduled_for)} ({timeUntil(activeAuth.scheduled_for)} from now).
                </p>
              ) : null}
              {booking.creator_payment_cents > 0 ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Creator payment</span>
                  <StatusBadge {...CREATOR_PAYMENT_STATUS_META[paymentRecord?.status ?? "not_required"]} />
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3 text-sm">
                {timeline.map((event, index) => (
                  <li key={index} className="flex gap-3">
                    <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-primary/60" />
                    <div>
                      <p>{event.label}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(event.at)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
