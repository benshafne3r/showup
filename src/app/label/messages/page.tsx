import type { Metadata } from "next";
import Link from "next/link";
import { requireLabelPage } from "../require-label";
import { serviceDb } from "@/server/db/service";
import { listThreadsFor, THREAD_PAGE } from "@/server/services/messaging-queries";
import { agenciesForCreators } from "@/server/services/agencies";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { ThreadList } from "@/components/messaging/thread-list";
import { REQUEST_STATUS_META } from "@/lib/statuses";
import { formatShowDate, formatDateTime } from "@/lib/dates";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Pager } from "@/components/pager";
import { pageOf } from "@/lib/pagination";
import { Inbox } from "lucide-react";

export const metadata: Metadata = { title: "Messages" };
export const dynamic = "force-dynamic";

const REQUEST_PAGE = 25;

export default async function LabelMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; sub?: string; pp?: string; wp?: string; dp?: string; tp?: string }>;
}) {
  const context = await requireLabelPage();
  const params = await searchParams;
  const defaultTab = params.tab === "messages" ? "messages" : "requests";
  const defaultSub = params.sub === "waitlisted" || params.sub === "decided" ? params.sub : "pending";
  const pages = {
    pending: pageOf(params.pp, REQUEST_PAGE),
    waitlisted: pageOf(params.wp, REQUEST_PAGE),
    decided: pageOf(params.dp, REQUEST_PAGE),
    threads: pageOf(params.tp, THREAD_PAGE),
  };

  // Each list is its own page of rows with its true total.
  const requestList = () =>
    serviceDb()
      .from("show_requests")
      .select(
        `id, status, ticket_count, includes_plus_one, message, created_at, creator_id,
         users:users!creator_id(full_name),
         shows!inner(date, artists(name), venues(city))`,
        { count: "exact" },
      )
      .eq("company_id", context.companyId)
      .order("created_at", { ascending: false });
  const [pendingRes, waitlistedRes, decidedRes, inbox] = await Promise.all([
    requestList().eq("status", "pending").range(pages.pending.from, pages.pending.to),
    requestList().eq("status", "waitlisted").range(pages.waitlisted.from, pages.waitlisted.to),
    requestList().not("status", "in", "(pending,waitlisted)").range(pages.decided.from, pages.decided.to),
    listThreadsFor({ id: context.user.id, side: "company", companyId: context.companyId }, { offset: pages.threads.from }),
  ]);

  const grouped = {
    pending: pendingRes.data ?? [],
    waitlisted: waitlistedRes.data ?? [],
    decided: decidedRes.data ?? [],
  };
  const totals = { pending: pendingRes.count ?? 0, waitlisted: waitlistedRes.count ?? 0, decided: decidedRes.count ?? 0 };
  const agencies = await agenciesForCreators(
    Array.from(new Set([...grouped.pending, ...grouped.waitlisted, ...grouped.decided].map((r) => r.creator_id))),
  );
  const pager = (sub: keyof typeof totals, key: string) => (
    <Pager
      page={pages[sub].page}
      size={REQUEST_PAGE}
      total={totals[sub]}
      basePath="/label/messages"
      params={{ ...params, tab: "requests", sub }}
      pageKey={key}
      className="mt-4"
    />
  );

  const renderList = (items: typeof grouped.pending, emptyLabel: string) =>
    items.length === 0 ? (
      <p className="py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>
    ) : (
      <ul className="space-y-2">
        {items.map((request) => (
          <li key={request.id}>
            <Link
              href={`/label/requests/${request.id}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/50"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {request.users?.full_name ?? "Creator"}
                  {agencies.get(request.creator_id) ? (
                    <span className="text-sky-300"> · via {agencies.get(request.creator_id)!.name}</span>
                  ) : null}
                  <span className="text-muted-foreground">
                    {" "}→ {request.shows.artists?.name} · {request.shows.venues?.city}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatShowDate(request.shows.date)} · {request.ticket_count} ticket
                  {request.ticket_count > 1 ? "s" : ""}
                  {request.includes_plus_one ? " (+1)" : ""} · applied {formatDateTime(request.created_at)}
                </p>
                {request.message ? (
                  <p className="mt-1 line-clamp-1 text-sm text-muted-foreground italic">
                    “{request.message}”
                  </p>
                ) : null}
              </div>
              <StatusBadge {...REQUEST_STATUS_META[request.status]} />
            </Link>
          </li>
        ))}
      </ul>
    );

  return (
    <div className="space-y-6">
      <PageHeader title="Messages" description="Creator requests and conversations." />
      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="requests">Requests ({totals.pending})</TabsTrigger>
          <TabsTrigger value="messages">Chats ({inbox.total})</TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="mt-4">
          {!totals.pending && !totals.waitlisted && !totals.decided ? (
            <EmptyState
              icon={Inbox}
              title="No requests yet"
              description="Publish a show opportunity and creator requests will land here."
            />
          ) : (
            <Tabs defaultValue={defaultSub}>
              <TabsList>
                <TabsTrigger value="pending">Pending ({totals.pending})</TabsTrigger>
                <TabsTrigger value="waitlisted">Waitlist ({totals.waitlisted})</TabsTrigger>
                <TabsTrigger value="decided">Decided ({totals.decided})</TabsTrigger>
              </TabsList>
              <TabsContent value="pending" className="mt-4">
                {renderList(grouped.pending, "Nothing pending. Nice inbox zero.")}
                {pager("pending", "pp")}
              </TabsContent>
              <TabsContent value="waitlisted" className="mt-4">
                {renderList(grouped.waitlisted, "No one on the waitlist.")}
                {pager("waitlisted", "wp")}
              </TabsContent>
              <TabsContent value="decided" className="mt-4">
                {renderList(grouped.decided, "No decided requests yet.")}
                {pager("decided", "dp")}
              </TabsContent>
            </Tabs>
          )}
        </TabsContent>

        <TabsContent value="messages" className="mt-4">
          <ThreadList threads={inbox.threads} basePath="/label/messages" />
          <Pager
            page={pages.threads.page}
            size={THREAD_PAGE}
            total={inbox.total}
            basePath="/label/messages"
            params={{ ...params, tab: "messages" }}
            pageKey="tp"
            className="mt-4"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
