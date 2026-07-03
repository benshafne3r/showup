import type { Metadata } from "next";
import { userDb } from "@/server/db/server-client";
import { requireCreator } from "@/server/auth/guards";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import {
  AUTHORIZATION_STATUS_META,
  CREATOR_PAYMENT_STATUS_META,
} from "@/lib/statuses";
import { formatCents } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AddCardForm } from "./add-card-form";
import { CreditCard, Landmark } from "lucide-react";

export const metadata: Metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

export default async function CreatorPaymentsPage() {
  const user = await requireCreator();
  const db = await userDb();

  const [{ data: methods }, { data: authorizations }, { data: payments }] = await Promise.all([
    db
      .from("payment_methods")
      .select("id, brand, last4, exp_month, exp_year, is_default, verified_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    db
      .from("authorization_records")
      .select("id, status, amount_cents, created_at, authorized_at, released_at, captured_at, shows:booking_id(id)")
      .eq("creator_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    db
      .from("creator_payment_records")
      .select("id, status, amount_cents, paid_at, created_at, booking_id")
      .eq("creator_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const totalEarned = (payments ?? [])
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + p.amount_cents, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description={`Total earned so far: ${formatCents(totalEarned)}`}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="size-4 text-primary" aria-hidden /> Payment method
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {methods?.length ? (
            <ul className="space-y-2">
              {methods.map((method) => (
                <li
                  key={method.id}
                  className="flex items-center justify-between rounded-lg border px-3 py-2"
                >
                  <span>
                    {method.brand.toUpperCase()} •••• {method.last4} · exp {method.exp_month}/
                    {method.exp_year}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {method.is_default ? "Default" : ""}
                    {method.verified_at ? " · Verified" : " · Unverified"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">
              No card on file yet. You'll add one when you accept your first booking — or add it
              now.
            </p>
          )}
          <AddCardForm hasCard={!!methods?.length} />
        </CardContent>
      </Card>

      <section className="space-y-3" aria-label="Temporary holds">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Temporary holds
        </h2>
        {!authorizations?.length ? (
          <EmptyState
            icon={Landmark}
            title="No holds yet"
            description="Holds appear when you confirm a booking. Attending a show releases its hold."
          />
        ) : (
          <ul className="space-y-2">
            {authorizations.map((auth) => (
              <li
                key={auth.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium">{formatCents(auth.amount_cents)}</p>
                  <p className="text-xs text-muted-foreground">
                    {auth.released_at
                      ? `Released ${formatDateTime(auth.released_at)}`
                      : auth.captured_at
                        ? `Charged ${formatDateTime(auth.captured_at)}`
                        : auth.authorized_at
                          ? `Placed ${formatDateTime(auth.authorized_at)}`
                          : `Created ${formatDateTime(auth.created_at)}`}
                  </p>
                </div>
                <StatusBadge {...AUTHORIZATION_STATUS_META[auth.status]} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3" aria-label="Creator payments">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Creator payments
        </h2>
        {!payments?.length ? (
          <EmptyState
            title="No payments yet"
            description="Complete content deliverables on a booking to earn creator payments."
          />
        ) : (
          <ul className="space-y-2">
            {payments.map((payment) => (
              <li
                key={payment.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-emerald-300">{formatCents(payment.amount_cents)}</p>
                  <p className="text-xs text-muted-foreground">
                    {payment.paid_at
                      ? `Paid ${formatDateTime(payment.paid_at)}`
                      : `Created ${formatDateTime(payment.created_at)}`}
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
