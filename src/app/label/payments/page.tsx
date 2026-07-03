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

export const metadata: Metadata = { title: "Payments & campaign spend" };
export const dynamic = "force-dynamic";

export default async function LabelPaymentsPage() {
  const context = await requireLabelPage();
  const db = serviceDb();

  const [{ data: payments }, { data: holds }, { data: bookings }] = await Promise.all([
    db
      .from("creator_payment_records")
      .select("id, status, amount_cents, paid_at, created_at, booking_id, users:users!creator_id(full_name)")
      .eq("company_id", context.companyId)
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("authorization_records")
      .select("id, status, amount_cents, capture_amount_cents, created_at, booking_id, users:users!creator_id(full_name)")
      .eq("company_id", context.companyId)
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("bookings")
      .select("status")
      .eq("company_id", context.companyId),
  ]);

  const paid = (payments ?? []).filter((p) => p.status === "paid").reduce((s, p) => s + p.amount_cents, 0);
  const committed = (payments ?? [])
    .filter((p) => ["pending_fulfillment", "ready"].includes(p.status))
    .reduce((s, p) => s + p.amount_cents, 0);
  const attended = (bookings ?? []).filter((b) => ["attended", "completed"].includes(b.status)).length;
  const completed = (bookings ?? []).filter((b) => b.status === "completed").length;
  const noShows = (bookings ?? []).filter((b) => b.status === "no_show_review").length;
  const totalConfirmed = (bookings ?? []).filter((b) =>
    ["confirmed", "attended", "completed", "no_show_review", "disputed"].includes(b.status),
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Payments & campaign spend" description="Where the money went, and what it bought." />

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Creator payments made", value: formatCents(paid) },
          { label: "Committed (pending)", value: formatCents(committed) },
          {
            label: "Attendance rate",
            value: totalConfirmed ? `${Math.round((attended / totalConfirmed) * 100)}%` : "—",
          },
          {
            label: "Completion rate",
            value: totalConfirmed ? `${Math.round((completed / totalConfirmed) * 100)}%` : "—",
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
