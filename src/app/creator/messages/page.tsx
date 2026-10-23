import type { Metadata } from "next";
import Link from "next/link";
import { userDb } from "@/server/db/server-client";
import { venueDetailsForCreator } from "@/server/services/venues";
import { requireCreator } from "@/server/auth/guards";
import { listThreadsFor, THREAD_PAGE } from "@/server/services/messaging-queries";
import { agencyForCreator } from "@/server/services/agencies";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { ThreadList } from "@/components/messaging/thread-list";
import { REQUEST_STATUS_META, type RequestStatus } from "@/lib/statuses";
import { formatShowDate } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Pager } from "@/components/pager";
import { pageOf } from "@/lib/pagination";
import { withdrawRequestAction } from "../actions";
import { Inbox } from "lucide-react";

export const metadata: Metadata = { title: "Messages" };
export const dynamic = "force-dynamic";

const REQUEST_PAGE = 25;

export default async function CreatorMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; submitted?: string; rp?: string; tp?: string }>;
}) {
  const user = await requireCreator();
  const params = await searchParams;
  const defaultTab = params.tab === "messages" ? "messages" : "requests";
  const requestPage = pageOf(params.rp, REQUEST_PAGE);
  const threadPage = pageOf(params.tp, THREAD_PAGE);

  const db = await userDb();
  const [{ data: requests, count: requestTotal }, inbox, agency] = await Promise.all([
    db
      .from("show_requests")
      .select(
        `id, status, ticket_count, includes_plus_one, message, created_at,
         shows!inner(id, date, hide_venue_until_approved, artists(name), venues(city)),
         bookings(id, status)`,
        { count: "exact" },
      )
      .eq("creator_id", user.id)
      .order("created_at", { ascending: false })
      .range(requestPage.from, requestPage.to),
    listThreadsFor({ id: user.id, side: "creator" }, { offset: threadPage.from }),
    agencyForCreator(user.id),
  ]);
  const venueOf = await venueDetailsForCreator(user.id, (requests ?? []).map((r) => r.shows.id));

  return (
    <div className="space-y-6">
      <PageHeader title="Messages" description="Your requests and conversations." />
      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="requests">Requests ({requestTotal ?? 0})</TabsTrigger>
          <TabsTrigger value="messages">{agency ? "Chats" : `Chats (${inbox.total})`}</TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="mt-4 space-y-4">
          {params.submitted ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300" role="status">
              Request sent! The artist team will review it, and you'll get a notification either way.
            </div>
          ) : null}
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
                const venue = venueOf.get(request.shows.id) ?? null;
                const hideLoc = !venue;
                return (
                  <li
                    key={request.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">
                        {request.shows.artists?.name}{" "}
                        <span className="text-muted-foreground">
                          {hideLoc
                            ? `· ${request.shows.venues?.city} · Secret location`
                            : `· ${venue?.name}, ${request.shows.venues?.city}`}
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
          <Pager
            page={requestPage.page}
            size={REQUEST_PAGE}
            total={requestTotal ?? 0}
            basePath="/creator/messages"
            params={{ ...params, tab: "requests", submitted: undefined }}
            pageKey="rp"
          />
        </TabsContent>

        <TabsContent value="messages" className="mt-4">
          {agency ? (
            <EmptyState
              icon={Inbox}
              title={`${agency.name} handles your conversations`}
              description="Artist teams message your management directly about your requests and bookings. You'll still get updates here about approvals, tickets and holds."
            />
          ) : (
            <>
              <ThreadList threads={inbox.threads} basePath="/creator/messages" />
              <Pager
                page={threadPage.page}
                size={THREAD_PAGE}
                total={inbox.total}
                basePath="/creator/messages"
                params={{ ...params, tab: "messages", submitted: undefined }}
                pageKey="tp"
                className="mt-4"
              />
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
