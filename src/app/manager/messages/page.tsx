import type { Metadata } from "next";
import Link from "next/link";
import { requireManagerPage } from "../require-manager";
import { rosterCreatorIds } from "@/server/services/agencies";
import { listThreadsFor } from "@/server/services/messaging-queries";
import { serviceDb } from "@/server/db/service";
import { withdrawForCreatorAction } from "../actions";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { ThreadList } from "@/components/messaging/thread-list";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { REQUEST_STATUS_META } from "@/lib/statuses";
import { formatDateTime, formatShowDate } from "@/lib/dates";
import { Inbox } from "lucide-react";

export const metadata: Metadata = { title: "Messages" };
export const dynamic = "force-dynamic";

export default async function ManagerMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; submitted?: string }>;
}) {
  const ctx = await requireManagerPage();
  const params = await searchParams;
  const defaultTab = params.tab === "requests" ? "requests" : "messages";
  const roster = await rosterCreatorIds(ctx.agencyId);

  const [{ data: requests }, threads] = await Promise.all([
    roster.length
      ? serviceDb()
          .from("show_requests")
          .select(
            `id, status, ticket_count, includes_plus_one, created_at,
             users:users!creator_id(full_name),
             bookings(id),
             shows!inner(date, artists(name), venues(city)),
             companies(name)`,
          )
          .in("creator_id", roster)
          .order("created_at", { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [] as never[] }),
    listThreadsFor({ id: ctx.user.id, side: "manager", agencyId: ctx.agencyId }),
  ]);
  const open = (requests ?? []).filter((r) => ["pending", "waitlisted"].includes(r.status));
  const decided = (requests ?? []).filter((r) => !["pending", "waitlisted"].includes(r.status));

  const renderList = (items: typeof open, emptyLabel: string) =>
    items.length === 0 ? (
      <p className="py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>
    ) : (
      <ul className="space-y-2">
        {items.map((request) => {
          const bookingId = request.bookings?.id;
          return (
            <li
              key={request.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {request.users?.full_name ?? "Creator"}
                  <span className="text-muted-foreground">
                    {" "}→ {request.shows.artists?.name} · {request.shows.venues?.city}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatShowDate(request.shows.date)} · {request.companies?.name} · {request.ticket_count}{" "}
                  ticket{request.ticket_count > 1 ? "s" : ""} · requested {formatDateTime(request.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge {...REQUEST_STATUS_META[request.status]} />
                {bookingId ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/manager/bookings/${bookingId}`}>Booking</Link>
                  </Button>
                ) : null}
                {["pending", "waitlisted"].includes(request.status) ? (
                  <form action={withdrawForCreatorAction}>
                    <input type="hidden" name="requestId" value={request.id} />
                    <Button type="submit" size="sm" variant="ghost">
                      Withdraw
                    </Button>
                  </form>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Messages"
        description="Your roster's ticket requests, and every conversation with artist teams about them."
      />
      {params.submitted ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          Request sent. The artist team will reply here, and the creator has been told.
        </div>
      ) : null}
      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="messages">Chats ({threads.length})</TabsTrigger>
          <TabsTrigger value="requests">Requests ({open.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="messages" className="mt-4">
          <ThreadList threads={threads} basePath="/manager/messages" />
        </TabsContent>
        <TabsContent value="requests" className="mt-4">
          {!requests?.length ? (
            <EmptyState
              icon={Inbox}
              title="No requests yet"
              description="Request tickets for your roster from the Shows tab, or your creators can request themselves."
            />
          ) : (
            <div className="space-y-6">
              <section className="space-y-2">
                <h2 className="text-sm font-semibold">Open ({open.length})</h2>
                {renderList(open, "Nothing waiting on artist teams.")}
              </section>
              <section className="space-y-2">
                <h2 className="text-sm font-semibold">Decided ({decided.length})</h2>
                {renderList(decided, "No decided requests yet.")}
              </section>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
