import type { Metadata } from "next";
import Link from "next/link";
import { requireManagerPage } from "../require-manager";
import { rosterCreatorIds } from "@/server/services/agencies";
import {
  getAgencyPayoutStatus,
  payoutsConfigured,
  syncAgencyPayoutStatus,
} from "@/server/services/connect";
import { serviceDb } from "@/server/db/service";
import { startAgencyPayoutOnboardingAction } from "../actions";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CREATOR_PAYMENT_STATUS_META } from "@/lib/statuses";
import { formatCents } from "@/lib/money";
import { formatDateTime, formatShowDate } from "@/lib/dates";
import { Banknote, CheckCircle2 } from "lucide-react";

export const metadata: Metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

export default async function ManagerPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ onboarding?: string }>;
}) {
  const ctx = await requireManagerPage();
  const params = await searchParams;
  const canManage = ctx.memberRole !== "member";

  const payoutStatus = payoutsConfigured()
    ? params.onboarding === "done" || params.onboarding === "refresh"
      ? await syncAgencyPayoutStatus(ctx.agencyId)
      : await getAgencyPayoutStatus(ctx.agencyId)
    : null;

  // Payments already sent to the agency, plus anything pending for the roster.
  const roster = await rosterCreatorIds(ctx.agencyId);
  const filters = [`payee_agency_id.eq.${ctx.agencyId}`];
  if (roster.length) filters.push(`creator_id.in.(${roster.join(",")})`);
  const { data: payments } = await serviceDb()
    .from("creator_payment_records")
    .select(
      `id, status, amount_cents, paid_at, created_at, booking_id, payee_agency_id,
       users:users!creator_id(full_name),
       bookings!inner(shows!inner(date, artists(name)))`,
    )
    .or(filters.join(","))
    .not("status", "in", "(not_required,canceled)")
    .order("created_at", { ascending: false })
    .limit(100);

  const received = (payments ?? [])
    .filter((p) => p.status === "paid" && p.payee_agency_id === ctx.agencyId)
    .reduce((sum, p) => sum + p.amount_cents, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description={`Content payments received for your roster: ${formatCents(received)}`}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Banknote className="size-4 text-primary" aria-hidden /> Getting paid
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            When an artist team approves content from one of your creators, the payment goes to{" "}
            {ctx.agencyName}&apos;s payout account. Ticket holds stay on each creator&apos;s own card.
          </p>
          {params.onboarding === "error" ? (
            <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-300">
              We couldn&apos;t start payout setup just now. Please try again in a bit.
            </p>
          ) : null}
          {!payoutStatus ? (
            <p className="text-muted-foreground">Payouts aren&apos;t enabled in this environment.</p>
          ) : payoutStatus.payoutsEnabled ? (
            <p className="flex items-center gap-2 text-emerald-300">
              <CheckCircle2 className="size-4" aria-hidden /> Payouts are active.
            </p>
          ) : canManage ? (
            <>
              <p>
                {payoutStatus.accountId
                  ? "Your payout setup is almost done. Finish verifying your business with Stripe."
                  : "Set up payouts with Stripe so artist teams can pay for your roster's content."}
              </p>
              <form action={startAgencyPayoutOnboardingAction}>
                <SubmitButton pendingLabel="Opening Stripe…">
                  {payoutStatus.accountId ? "Finish payout setup" : "Set up payouts"}
                </SubmitButton>
              </form>
              {params.onboarding === "done" ? (
                <p className="text-xs text-muted-foreground">
                  Still finishing up? Stripe can take a moment to verify, so refresh this page shortly.
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-amber-300">Ask your company owner to finish payout setup.</p>
          )}
        </CardContent>
      </Card>

      <section className="space-y-3" aria-label="Roster payments">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Roster payments
        </h2>
        {!payments?.length ? (
          <EmptyState
            title="No payments yet"
            description="Payments show up once your creators book paid shows."
          />
        ) : (
          <ul className="space-y-2">
            {payments.map((payment) => (
              <li
                key={payment.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    <span className="text-emerald-300">{formatCents(payment.amount_cents)}</span>{" "}
                    <Link href={`/manager/bookings/${payment.booking_id}`} className="hover:underline">
                      {payment.users?.full_name} · {payment.bookings.shows.artists?.name}
                    </Link>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatShowDate(payment.bookings.shows.date)} ·{" "}
                    {payment.paid_at ? `Paid ${formatDateTime(payment.paid_at)}` : `Created ${formatDateTime(payment.created_at)}`}
                  </p>
                </div>
                <StatusBadge {...CREATOR_PAYMENT_STATUS_META[payment.status]} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
