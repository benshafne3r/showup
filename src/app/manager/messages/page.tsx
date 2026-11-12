import type { Metadata } from "next";
import Link from "next/link";
import { requireManagerPage } from "../require-manager";
import { listThreadsFor, THREAD_PAGE } from "@/server/services/messaging-queries";
import { serviceDb } from "@/server/db/service";
import { withdrawForCreatorAction } from "../actions";
import { pendingOffersForAgency, showBriefs } from "@/server/services/offers";
import { agencyDefaultPaymentMethod } from "@/server/services/payments";
import { WaitingInvites, type WaitingShow } from "./waiting-invites";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { ThreadList } from "@/components/messaging/thread-list";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pager } from "@/components/pager";
import { pageOf } from "@/lib/pagination";
import { requestOutcomeMeta } from "@/lib/statuses";
import { formatDateTime, formatShowDate } from "@/lib/dates";
import { Inbox } from "lucide-react";

export const metadata: Metadata = { title: "Messages" };
export const dynamic = "force-dynamic";

const REQUEST_PAGE = 25;

/** One page of the roster's requests (open or decided), newest first, with the true total. */
async function rosterRequests(agencyId: string, open: boolean, offset: number) {
  const db = serviceDb();
  const { data: page, error } = await db.rpc("agency_request_page", {
    p_agency_id: agencyId,
    p_open: open,
    p_limit: REQUEST_PAGE,
    p_offset: offset,
  });
  if (error) throw new Error(`roster requests: ${error.message}`);
  const ids = (page ?? []).map((r) => r.request_id);
  const total = Number(page?.[0]?.total ?? 0);
  if (!ids.length) return { rows: [], total };
  const { data } = await db
    .from("show_requests")
    .select(
      `id, status, ticket_count, includes_plus_one, created_at,
       users:users!creator_id(full_name),
       bookings(id, status),
       shows!inner(date, artists(name), venues(city)),
       companies(name)`,
    )
    .in("id", ids);
  const byId = new Map((data ?? []).map((r) => [r.id, r]));
  return { rows: ids.map((id) => byId.get(id)).filter((r) => r !== undefined), total };
}

export default async function ManagerMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; submitted?: string; op?: string; dp?: string; tp?: string }>;
}) {
  const ctx = await requireManagerPage();
  const params = await searchParams;
  const openPage = pageOf(params.op, REQUEST_PAGE);
  const decidedPage = pageOf(params.dp, REQUEST_PAGE);
  const threadPage = pageOf(params.tp, THREAD_PAGE);

  const [openList, decidedList, inbox, offers, card] = await Promise.all([
    rosterRequests(ctx.agencyId, true, openPage.from),
    rosterRequests(ctx.agencyId, false, decidedPage.from),
    listThreadsFor({ id: ctx.user.id, side: "manager", agencyId: ctx.agencyId }, { offset: threadPage.from }),
    pendingOffersForAgency(ctx.agencyId),
    agencyDefaultPaymentMethod(ctx.agencyId),
  ]);
  // Label invites waiting on the agency open the Requests tab.
  const defaultTab = params.tab === "messages" ? "messages" : params.tab === "requests" || offers.length ? "requests" : "messages";
  const briefs = await showBriefs([...new Set(offers.map((o) => o.showId))]);
  const waiting: WaitingShow[] = [];
  for (const offer of offers) {
    let show = waiting.find((w) => w.showId === offer.showId);
    if (!show) {
      show = {
        showId: offer.showId,
        title: [offer.artist, formatShowDate(offer.date), offer.city].filter(Boolean).join(" · "),
        detail: `${offer.label} · answer by ${formatDateTime(offer.acceptBy)}`,
        brief: briefs.get(offer.showId) ?? "",
        invites: [],
      };
      waiting.push(show);
    }
    show.invites.push({ bookingId: offer.bookingId, creatorName: offer.creatorName, avatarUrl: offer.avatarUrl, hold: offer.hold });
  }
  const open = openList.rows;
  const decided = decidedList.rows;
  const requestPager = (page: number, total: number, key: string) => (
    <Pager
      page={page}
      size={REQUEST_PAGE}
      total={total}
      basePath="/manager/messages"
      params={{ ...params, tab: "requests", submitted: undefined }}
      pageKey={key}
    />
  );

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
                <StatusBadge {...requestOutcomeMeta(request.status, request.bookings?.status)} />
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
      <PageHeader title="Messages" />
      {params.submitted ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          Request sent. The artist team will reply here, and the creator has been told.
        </div>
      ) : null}
      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="messages">Chats ({inbox.total})</TabsTrigger>
          <TabsTrigger value="requests">Requests ({offers.length + openList.total})</TabsTrigger>
        </TabsList>
        <TabsContent value="messages" className="mt-4">
          <ThreadList threads={inbox.threads} basePath="/manager/messages" />
          <Pager
            page={threadPage.page}
            size={THREAD_PAGE}
            total={inbox.total}
            basePath="/manager/messages"
            params={{ ...params, tab: "messages", submitted: undefined }}
            pageKey="tp"
            className="mt-4"
          />
        </TabsContent>
        <TabsContent value="requests" className="mt-4 space-y-6">
          {waiting.length ? (
            <WaitingInvites shows={waiting} card={card ? `${card.brand} •••• ${card.last4}` : null} />
          ) : null}
          {!openList.total && !decidedList.total ? (
            waiting.length ? null : (
            <EmptyState
              icon={Inbox}
              title="No requests yet"
            />
            )
          ) : (
            <div className="space-y-6">
              <section className="space-y-2">
                <h2 className="text-sm font-semibold">Open ({openList.total})</h2>
                {renderList(open, "Nothing waiting on artist teams.")}
                {requestPager(openPage.page, openList.total, "op")}
              </section>
              <section className="space-y-2">
                <h2 className="text-sm font-semibold">Decided ({decidedList.total})</h2>
                {renderList(decided, "No decided requests yet.")}
                {requestPager(decidedPage.page, decidedList.total, "dp")}
              </section>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
