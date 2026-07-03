import { notFound } from "next/navigation";
import Link from "next/link";
import { requireLabelPage } from "../../require-label";
import { serviceDb } from "@/server/db/service";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import {
  BOOKING_STATUS_META,
  REQUEST_STATUS_META,
} from "@/lib/statuses";
import { formatShowDateLong } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { CancelShowDialog } from "./cancel-show-dialog";
import { Pencil } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ShowDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const context = await requireLabelPage();
  const { id } = await params;
  const query = await searchParams;
  const db = serviceDb();

  const { data: show } = await db
    .from("shows")
    .select(
      `id, date, status, cancel_reason, artists(name), venues(name, city, state),
       show_opportunities(
         id, stated_ticket_value_cents, deposit_percentage, creator_payment_cents,
         plus_one_allowed, tickets_total, tickets_claimed, application_deadline, published_at
       )`,
    )
    .eq("id", id)
    .eq("company_id", context.companyId)
    .maybeSingle();
  if (!show) notFound();

  const opp = show.show_opportunities;

  const [{ data: requests }, { data: bookings }] = await Promise.all([
    db
      .from("show_requests")
      .select("id, status, ticket_count, created_at, users:users!creator_id(full_name)")
      .eq("show_id", id)
      .order("created_at", { ascending: false }),
    db
      .from("bookings")
      .select("id, status, ticket_count, attendance_state, content_state, users:users!creator_id(full_name)")
      .eq("show_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const attendedCount = (bookings ?? []).filter((b) =>
    ["attended", "completed"].includes(b.status),
  ).length;
  const confirmedCount = (bookings ?? []).filter((b) =>
    ["confirmed", "attended", "completed", "no_show_review", "disputed"].includes(b.status),
  ).length;

  return (
    <div className="space-y-6">
      {query.saved ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300" role="status">
          Show saved.
        </div>
      ) : null}
      <PageHeader
        title={`${show.artists?.name} — ${show.venues?.city}`}
        description={`${formatShowDateLong(show.date)} · ${show.venues?.name}${show.status !== "published" ? ` · ${show.status.toUpperCase()}` : ""}`}
        action={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/label/shows/${show.id}/edit`}>
                <Pencil className="size-4" aria-hidden /> Edit
              </Link>
            </Button>
            {["draft", "published", "postponed"].includes(show.status) ? (
              <CancelShowDialog showId={show.id} />
            ) : null}
          </div>
        }
      />

      {opp ? (
        <div className="grid gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-2xl font-bold">
                {opp.tickets_claimed}
                <span className="text-base font-normal text-muted-foreground">/{opp.tickets_total}</span>
              </p>
              <p className="text-sm text-muted-foreground">tickets claimed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-2xl font-bold">{(requests ?? []).filter((r) => r.status === "pending").length}</p>
              <p className="text-sm text-muted-foreground">pending requests</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-2xl font-bold">{confirmedCount}</p>
              <p className="text-sm text-muted-foreground">confirmed creators</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-2xl font-bold">{attendedCount}</p>
              <p className="text-sm text-muted-foreground">attended</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {opp ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Opportunity terms</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Stated ticket value:</span>{" "}
              <strong>{formatCents(opp.stated_ticket_value_cents)}</strong>
            </p>
            <p>
              <span className="text-muted-foreground">Deposit:</span>{" "}
              <strong>{opp.deposit_percentage}%</strong>
            </p>
            <p>
              <span className="text-muted-foreground">Creator payment:</span>{" "}
              <strong>
                {opp.creator_payment_cents > 0 ? formatCents(opp.creator_payment_cents) : "attend-only"}
              </strong>
            </p>
            <p>
              <span className="text-muted-foreground">+1:</span>{" "}
              <strong>{opp.plus_one_allowed ? "allowed" : "not allowed"}</strong>
            </p>
            <p>
              <span className="text-muted-foreground">Visibility:</span>{" "}
              <strong>{opp.published_at ? "published" : "draft"}</strong>
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Requests</CardTitle>
          </CardHeader>
          <CardContent>
            {requests?.length ? (
              <ul className="divide-y">
                {requests.map((request) => (
                  <li key={request.id}>
                    <Link
                      href={`/label/requests/${request.id}`}
                      className="flex items-center justify-between gap-2 py-2.5 text-sm hover:bg-muted/40"
                    >
                      <span>
                        {request.users?.full_name ?? "Creator"}
                        <span className="text-muted-foreground"> · {request.ticket_count} ticket{request.ticket_count > 1 ? "s" : ""}</span>
                      </span>
                      <StatusBadge {...REQUEST_STATUS_META[request.status]} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No requests yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bookings</CardTitle>
          </CardHeader>
          <CardContent>
            {bookings?.length ? (
              <ul className="divide-y">
                {bookings.map((booking) => (
                  <li key={booking.id}>
                    <Link
                      href={`/label/bookings/${booking.id}`}
                      className="flex items-center justify-between gap-2 py-2.5 text-sm hover:bg-muted/40"
                    >
                      <span>{booking.users?.full_name ?? "Creator"}</span>
                      <StatusBadge {...BOOKING_STATUS_META[booking.status]} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No bookings yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
