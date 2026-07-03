import { notFound } from "next/navigation";
import Link from "next/link";
import { requireLabelPage } from "../../require-label";
import { serviceDb } from "@/server/db/service";
import { signedFileUrls } from "@/server/services/uploads";
import { StatusBadge } from "@/components/status-badge";
import {
  ATTENDANCE_STATUS_META,
  AUTHORIZATION_STATUS_META,
  BOOKING_STATUS_META,
  CONTENT_STATUS_META,
  CREATOR_PAYMENT_STATUS_META,
} from "@/lib/statuses";
import { formatShowDateLong, formatDateTime } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TermsBreakdown } from "@/components/terms-breakdown";
import { InstructionsForm } from "./instructions-form";
import { AttendanceReview } from "./attendance-review";
import { ContentReview } from "./content-review";
import { NoShowActions } from "./no-show-actions";
import { CancelBookingDialog } from "./cancel-booking-dialog";
import { RetryPayoutButton } from "./retry-payout";
import { ExternalLink, MessageSquare } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LabelBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireLabelPage();
  const { id } = await params;
  const db = serviceDb();

  const { data: booking } = await db
    .from("bookings")
    .select(
      `id, status, request_id, creator_id, stated_ticket_value_cents, deposit_percentage,
       authorization_amount_cents, creator_payment_cents, ticket_count, includes_plus_one,
       content_required, content_state, content_deadline_at, attendance_state,
       acceptance_deadline_at, accepted_at, ticket_instructions, ticket_instructions_sent_at,
       canceled_at, cancel_reason, completed_at, created_at,
       shows!inner(date, artists(name), venues(name, city)),
       users:users!creator_id(full_name),
       authorization_records(id, status, amount_cents, scheduled_for, authorized_at, released_at, captured_at, capture_amount_cents, failure_reason, created_at),
       creator_payment_records(status, amount_cents, paid_at, failure_reason),
       attendance_submissions(id, status, checked_in_at, note, proof_paths, review_note, created_at),
       content_submissions(id, status, post_url, caption_note, proof_paths, review_note, submitted_at)`,
    )
    .eq("id", id)
    .eq("company_id", context.companyId)
    .maybeSingle();
  if (!booking) notFound();

  const { data: thread } = await db
    .from("message_threads")
    .select("id")
    .eq("request_id", booking.request_id)
    .maybeSingle();

  const creatorName = booking.users?.full_name ?? "Creator";
  const activeAuth = [...(booking.authorization_records ?? [])].sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1,
  )[0];
  const paymentRecord = booking.creator_payment_records;

  const latestAttendance = [...(booking.attendance_submissions ?? [])].sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1,
  )[0];
  const attendanceProofUrls = latestAttendance
    ? await signedFileUrls("proofs", latestAttendance.proof_paths)
    : [];

  const contentSubmissions = await Promise.all(
    [...(booking.content_submissions ?? [])]
      .sort((a, b) => (a.submitted_at < b.submitted_at ? 1 : -1))
      .map(async (submission) => ({
        ...submission,
        proofUrls: await signedFileUrls("proofs", submission.proof_paths),
      })),
  );

  const canSendInstructions = ["confirmed", "authorization_failed", "attended"].includes(booking.status);
  const canReviewAttendance =
    latestAttendance?.status === "submitted" &&
    ["confirmed", "attended", "authorization_failed", "no_show_review"].includes(booking.status);
  const showNoShowActions =
    ["confirmed", "no_show_review"].includes(booking.status) &&
    booking.attendance_state !== "approved" &&
    new Date(`${booking.shows.date}T23:59:59`) < new Date();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/label/shows" className="hover:underline">Shows</Link> / booking
          </p>
          <h1 className="text-2xl font-bold tracking-tight">
            {creatorName} @ {booking.shows.artists?.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {formatShowDateLong(booking.shows.date)} · {booking.shows.venues?.name},{" "}
            {booking.shows.venues?.city} · {booking.ticket_count} ticket
            {booking.ticket_count > 1 ? "s" : ""}
            {booking.includes_plus_one ? " (+1)" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge {...BOOKING_STATUS_META[booking.status]} />
          {thread ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/label/messages/${thread.id}`}>
                <MessageSquare className="size-4" aria-hidden /> Message
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {/* Ticket instructions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ticket instructions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {booking.ticket_instructions ? (
                <div className="rounded-lg border bg-muted/40 p-3 whitespace-pre-wrap">
                  {booking.ticket_instructions}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sent {booking.ticket_instructions_sent_at ? formatDateTime(booking.ticket_instructions_sent_at) : ""}
                  </p>
                </div>
              ) : null}
              {canSendInstructions ? (
                <InstructionsForm
                  bookingId={booking.id}
                  existing={booking.ticket_instructions ?? ""}
                />
              ) : !booking.ticket_instructions ? (
                <p className="text-muted-foreground">
                  Instructions can be sent once the booking is confirmed.
                </p>
              ) : null}
            </CardContent>
          </Card>

          {/* Attendance review */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Attendance</CardTitle>
              <StatusBadge {...ATTENDANCE_STATUS_META[booking.attendance_state]} />
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {latestAttendance ? (
                <div className="rounded-lg border bg-muted/40 p-3">
                  <p>
                    Checked in {formatDateTime(latestAttendance.checked_in_at)}
                    {latestAttendance.note ? ` — “${latestAttendance.note}”` : ""}
                  </p>
                  {attendanceProofUrls.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {attendanceProofUrls.map((proof, index) =>
                        proof.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <a key={index} href={proof.url} target="_blank" rel="noreferrer">
                            <img
                              src={proof.url}
                              alt={`Attendance proof ${index + 1} from ${creatorName}`}
                              className="h-28 w-auto rounded-md border object-cover"
                            />
                          </a>
                        ) : null,
                      )}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">No proof images attached.</p>
                  )}
                  {latestAttendance.review_note ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Review note: {latestAttendance.review_note}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-muted-foreground">The creator hasn't checked in yet.</p>
              )}
              {canReviewAttendance ? <AttendanceReview bookingId={booking.id} /> : null}
              {showNoShowActions && !canReviewAttendance ? (
                <NoShowActions
                  bookingId={booking.id}
                  holdActive={activeAuth?.status === "authorized"}
                  holdCents={booking.authorization_amount_cents}
                />
              ) : null}
            </CardContent>
          </Card>

          {/* Content review */}
          {booking.content_required ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Content review</CardTitle>
                <StatusBadge {...CONTENT_STATUS_META[booking.content_state]} />
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {booking.content_deadline_at ? (
                  <p className="text-xs text-muted-foreground">
                    Creator deadline: {formatDateTime(booking.content_deadline_at)}
                  </p>
                ) : null}
                {contentSubmissions.length === 0 ? (
                  <p className="text-muted-foreground">No content submitted yet.</p>
                ) : (
                  contentSubmissions.map((submission) => (
                    <div key={submission.id} className="space-y-2 rounded-lg border bg-muted/40 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <a
                          href={submission.post_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-w-0 items-center gap-1 truncate text-primary hover:underline"
                        >
                          {submission.post_url} <ExternalLink className="size-3 shrink-0" aria-hidden />
                        </a>
                        <StatusBadge {...CONTENT_STATUS_META[submission.status]} />
                      </div>
                      {submission.caption_note ? (
                        <p className="text-xs text-muted-foreground">“{submission.caption_note}”</p>
                      ) : null}
                      {submission.proofUrls.length ? (
                        <div className="flex flex-wrap gap-2">
                          {submission.proofUrls.map((proof, index) =>
                            proof.url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <a key={index} href={proof.url} target="_blank" rel="noreferrer">
                                <img
                                  src={proof.url}
                                  alt={`Content proof ${index + 1}`}
                                  className="h-24 w-auto rounded-md border object-cover"
                                />
                              </a>
                            ) : null,
                          )}
                        </div>
                      ) : null}
                      {submission.review_note ? (
                        <p className="text-xs text-muted-foreground">Note sent: {submission.review_note}</p>
                      ) : null}
                      {submission.status === "submitted" ? (
                        <ContentReview
                          bookingId={booking.id}
                          submissionId={submission.id}
                          paymentCents={booking.creator_payment_cents}
                        />
                      ) : null}
                    </div>
                  ))
                )}
                {paymentRecord?.status === "failed" ? (
                  <div className="rounded-lg border border-red-500/40 p-3">
                    <p className="text-red-300">
                      Payout failed: {paymentRecord.failure_reason ?? "unknown error"}
                    </p>
                    <RetryPayoutButton bookingId={booking.id} />
                  </div>
                ) : null}
              </CardContent>
            </Card>
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
              <CardTitle className="text-base">Money status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Hold</span>
                <StatusBadge {...AUTHORIZATION_STATUS_META[activeAuth?.status ?? "not_scheduled"]} />
              </div>
              {activeAuth?.scheduled_for && activeAuth.status === "scheduled" ? (
                <p className="text-xs text-muted-foreground">
                  Placement scheduled {formatDateTime(activeAuth.scheduled_for)}
                </p>
              ) : null}
              {activeAuth?.capture_amount_cents ? (
                <p className="text-xs text-muted-foreground">
                  Captured {formatCents(activeAuth.capture_amount_cents)}
                </p>
              ) : null}
              {booking.creator_payment_cents > 0 ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Creator payment</span>
                  <StatusBadge {...CREATOR_PAYMENT_STATUS_META[paymentRecord?.status ?? "not_required"]} />
                </div>
              ) : null}
              {booking.cancel_reason ? (
                <p className="text-xs text-muted-foreground">Cancel reason: {booking.cancel_reason}</p>
              ) : null}
            </CardContent>
          </Card>

          {["awaiting_acceptance", "awaiting_payment_method", "confirmed", "authorization_failed"].includes(
            booking.status,
          ) ? (
            <CancelBookingDialog bookingId={booking.id} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
