import type { Metadata } from "next";
import Link from "next/link";
import { userDb } from "@/server/db/server-client";
import { requireCreator } from "@/server/auth/guards";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { REQUEST_STATUS_META, type RequestStatus } from "@/lib/statuses";
import { formatShowDate } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { withdrawRequestAction } from "../actions";
import { Inbox } from "lucide-react";

export const metadata: Metadata = { title: "My requests" };
export const dynamic = "force-dynamic";

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const user = await requireCreator();
  const params = await searchParams;
  const db = await userDb();

  const { data: requests } = await db
    .from("show_requests")
    .select(
      `id, status, ticket_count, includes_plus_one, message, created_at,
       shows!inner(id, date, artists(name), venues(name, city)),
       bookings(id, status)`,
    )
    .eq("creator_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      {params.submitted ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300" role="status">
          Request sent! The artist team will review it — you'll get a notification either way.
        </div>
      ) : null}
      <PageHeader title="My requests" description="Everything you've applied for." />
      {!requests?.length ? (
        <EmptyState
          icon={Inbox}
          title="No requests yet"
          description="Find a show you love and request free access."
          action={
            <Button asChild>
              <Link href="/creator">Discover shows</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {requests.map((request) => {
            const booking = request.bookings;
            const meta = REQUEST_STATUS_META[request.status as RequestStatus];
            return (
              <li
                key={request.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {request.shows.artists?.name}{" "}
                    <span className="text-muted-foreground">
                      · {request.shows.venues?.name}, {request.shows.venues?.city}
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatShowDate(request.shows.date)} · {request.ticket_count} ticket
                    {request.ticket_count > 1 ? "s" : ""}
                    {request.includes_plus_one ? " (incl. +1)" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge {...meta} />
                  {request.status === "approved" && booking ? (
                    <Button asChild size="sm">
                      <Link href={`/creator/bookings/${booking.id}`}>
                        {booking.status === "awaiting_acceptance" ? "Accept now" : "View booking"}
                      </Link>
                    </Button>
                  ) : null}
                  {["pending", "waitlisted"].includes(request.status) ? (
                    <form action={withdrawRequestAction}>
                      <input type="hidden" name="requestId" value={request.id} />
                      <Button variant="ghost" size="sm" type="submit">
                        Withdraw
                      </Button>
                    </form>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
