import type { Metadata } from "next";
import Link from "next/link";
import { requireLabelPage } from "../require-label";
import { serviceDb } from "@/server/db/service";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import {
  AUTHORIZATION_STATUS_META,
  CREATOR_PAYMENT_STATUS_META,
} from "@/lib/statuses";
import { formatCents } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { Pager } from "@/components/pager";
import { pageOf } from "@/lib/pagination";
import { companyDefaultPaymentMethod } from "@/server/services/payments";
import { addCompanyCardAction, addCompanyCardTokenAction } from "../actions";
import { AddCardForm } from "@/app/creator/payments/add-card-form";
import { StripeCardForm } from "@/app/creator/payments/stripe-card-form";
import { publicEnv, serverEnv } from "@/lib/env";
import { CreditCard } from "lucide-react";

export const metadata: Metadata = { title: "Payments & campaign spend" };
export const dynamic = "force-dynamic";

const LIST_PAGE = 50;

export default async function LabelPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ pp?: string; hp?: string }>;
}) {
  const context = await requireLabelPage();
  const params = await searchParams;
  const paymentPage = pageOf(params.pp, LIST_PAGE);
  const holdPage = pageOf(params.hp, LIST_PAGE);
  const db = serviceDb();

  // Totals are aggregates over everything; the lists are one page each.
  const [{ data: payments, count: paymentTotal }, { data: holds, count: holdTotal }, { data: totals }, card] = await Promise.all([
    db
      .from("creator_payment_records")
      .select("id, status, amount_cents, paid_at, created_at, booking_id, users:users!creator_id(full_name)", {
        count: "exact",
      })
      .eq("company_id", context.companyId)
      .order("created_at", { ascending: false })
      .range(paymentPage.from, paymentPage.to),
    db
      .from("authorization_records")
      .select("id, status, amount_cents, capture_amount_cents, created_at, booking_id, users:users!creator_id(full_name)", {
        count: "exact",
      })
      .eq("company_id", context.companyId)
      .order("created_at", { ascending: false })
      .range(holdPage.from, holdPage.to),
    db.rpc("company_payment_totals", { p_company_id: context.companyId }),
    companyDefaultPaymentMethod(context.companyId),
  ]);
  const canManageCard = context.memberRole !== "member";

  const t = totals?.[0];
  const paid = Number(t?.paid_cents ?? 0);
  const committed = Number(t?.committed_cents ?? 0);
  const attended = Number(t?.attended ?? 0);
  const completed = Number(t?.completed ?? 0);
  const noShows = Number(t?.no_shows ?? 0);
  const totalConfirmed = Number(t?.confirmed ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Payments & campaign spend" description="Where the money went, and what it bought." />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="size-4 text-primary" aria-hidden /> Card for creator payments
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            When you approve a creator&apos;s content, their content fee is charged to this card and paid to them.
            Shows without a content fee never charge it.
          </p>
          {card ? (
            <p className="font-medium">
              {card.brand} •••• {card.last4}
              {card.exp_month && card.exp_year ? (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · expires {String(card.exp_month).padStart(2, "0")}/{card.exp_year}
                </span>
              ) : null}
            </p>
          ) : (
            <p className="text-amber-300">No card yet. Add one before approving content you pay creators for.</p>
          )}
          {canManageCard ? (
            serverEnv.paymentProvider === "stripe" && publicEnv.stripePublishableKey ? (
              <StripeCardForm hasCard={!!card} action={addCompanyCardTokenAction} />
            ) : (
              <AddCardForm hasCard={!!card} action={addCompanyCardAction} />
            )
          ) : (
            <p className="text-xs text-muted-foreground">Only your company owner or an admin can change the card.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Creator payments made", value: formatCents(paid) },
          { label: "Committed (pending)", value: formatCents(committed) },
          {
            label: "Attendance rate",
            value: totalConfirmed ? `${Math.round((attended / totalConfirmed) * 100)}%` : "-",
          },
          {
            label: "Completion rate",
            value: totalConfirmed ? `${Math.round((completed / totalConfirmed) * 100)}%` : "-",
          },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-6">
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      {noShows > 0 ? (
        <p className="text-sm text-amber-300">{noShows} booking(s) currently in no-show review.</p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Creator payments</CardTitle>
          </CardHeader>
          <CardContent>
            {payments?.length ? (
              <ul className="divide-y text-sm">
                {payments.map((payment) => (
                  <li key={payment.id} className="flex items-center justify-between gap-2 py-2.5">
                    <Link href={`/label/bookings/${payment.booking_id}`} className="min-w-0 truncate hover:underline">
                      {payment.users?.full_name ?? "Creator"} · {formatCents(payment.amount_cents)}
                    </Link>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {payment.paid_at ? formatDateTime(payment.paid_at) : ""}
                      </span>
                      <StatusBadge {...CREATOR_PAYMENT_STATUS_META[payment.status]} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No creator payments yet.</p>
            )}
            <Pager
              page={paymentPage.page}
              size={LIST_PAGE}
              total={paymentTotal ?? 0}
              basePath="/label/payments"
              params={params}
              pageKey="pp"
              className="mt-3"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Holds (creator side)</CardTitle>
          </CardHeader>
          <CardContent>
            {holds?.length ? (
              <ul className="divide-y text-sm">
                {holds.map((hold) => (
                  <li key={hold.id} className="flex items-center justify-between gap-2 py-2.5">
                    <Link href={`/label/bookings/${hold.booking_id}`} className="min-w-0 truncate hover:underline">
                      {hold.users?.full_name ?? "Creator"} ·{" "}
                      {formatCents(hold.capture_amount_cents ?? hold.amount_cents)}
                    </Link>
                    <StatusBadge {...AUTHORIZATION_STATUS_META[hold.status]} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No holds yet.</p>
            )}
            <Pager
              page={holdPage.page}
              size={LIST_PAGE}
              total={holdTotal ?? 0}
              basePath="/label/payments"
              params={params}
              pageKey="hp"
              className="mt-3"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
