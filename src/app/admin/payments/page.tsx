import type { Metadata } from "next";
import { requireAdmin } from "@/server/auth/guards";
import { serviceDb } from "@/server/db/service";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import {
  AUTHORIZATION_STATUS_META,
  CREATOR_PAYMENT_STATUS_META,
} from "@/lib/statuses";
import { formatCents } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HoldActions, PayoutActions } from "./money-actions";
import { adminTogglePayoutPauseAction, adminCancelPayoutAction } from "../actions";

export const metadata: Metadata = { title: "Payments & authorizations" };
export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage() {
  await requireAdmin();
  const db = serviceDb();

  const [{ data: holds }, { data: payouts }] = await Promise.all([
    db
      .from("authorization_records")
      .select(
        `id, status, amount_cents, capture_amount_cents, scheduled_for, failure_reason,
         grace_deadline_at, created_at, booking_id,
         users:users!creator_id(full_name), companies(name)`,
      )
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("creator_payment_records")
      .select(
        `id, status, amount_cents, paid_at, failure_reason, paused_at, created_at, booking_id,
         users:users!creator_id(full_name), companies(name)`,
      )
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments & authorizations"
        description="Manual overrides are audit-logged and only allowed where the state machine permits."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Authorizations (holds)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                  <th scope="col" className="px-3 py-2 font-medium">Creator</th>
                  <th scope="col" className="px-3 py-2 font-medium">Company</th>
                  <th scope="col" className="px-3 py-2 font-medium">Amount</th>
                  <th scope="col" className="px-3 py-2 font-medium">Status</th>
                  <th scope="col" className="px-3 py-2 font-medium">Detail</th>
                  <th scope="col" className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(holds ?? []).map((hold) => (
                  <tr key={hold.id} className="border-b last:border-0">
                    <td className="px-3 py-2.5">{hold.users?.full_name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{hold.companies?.name}</td>
                    <td className="px-3 py-2.5">
                      {formatCents(hold.capture_amount_cents ?? hold.amount_cents)}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge {...AUTHORIZATION_STATUS_META[hold.status]} />
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {hold.status === "scheduled" && hold.scheduled_for
                        ? `places ${formatDateTime(hold.scheduled_for)}`
                        : hold.status === "failed"
                          ? (hold.failure_reason ?? "failed")
                          : ""}
                    </td>
                    <td className="px-3 py-2.5">
                      {hold.status === "authorized" ? <HoldActions authorizationId={hold.id} /> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Creator payouts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                  <th scope="col" className="px-3 py-2 font-medium">Creator</th>
                  <th scope="col" className="px-3 py-2 font-medium">Company</th>
                  <th scope="col" className="px-3 py-2 font-medium">Amount</th>
                  <th scope="col" className="px-3 py-2 font-medium">Status</th>
                  <th scope="col" className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(payouts ?? []).map((payout) => (
                  <tr key={payout.id} className="border-b last:border-0">
                    <td className="px-3 py-2.5">{payout.users?.full_name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{payout.companies?.name}</td>
                    <td className="px-3 py-2.5">{formatCents(payout.amount_cents)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <StatusBadge {...CREATOR_PAYMENT_STATUS_META[payout.status]} />
                        {payout.paused_at ? (
                          <StatusBadge label="paused" tone="warning" />
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-1">
                        {["ready", "failed"].includes(payout.status) && !payout.paused_at ? (
                          <PayoutActions bookingId={payout.booking_id} />
                        ) : null}
                        {["pending_fulfillment", "ready", "failed", "disputed"].includes(payout.status) ? (
                          <>
                            <form action={adminTogglePayoutPauseAction}>
                              <input type="hidden" name="recordId" value={payout.id} />
                              <input type="hidden" name="pause" value={payout.paused_at ? "0" : "1"} />
                              <Button variant="ghost" size="sm" type="submit">
                                {payout.paused_at ? "Unpause" : "Pause"}
                              </Button>
                            </form>
                            <form action={adminCancelPayoutAction}>
                              <input type="hidden" name="recordId" value={payout.id} />
                              <Button variant="ghost" size="sm" type="submit" className="text-red-300">
                                Cancel
                              </Button>
                            </form>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
