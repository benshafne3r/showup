import type { Metadata } from "next";
import Link from "next/link";
import { requireLabelPage } from "../require-label";
import { serviceDb } from "@/server/db/service";
import { listThreadsFor } from "@/server/services/messaging-queries";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { ThreadList } from "@/components/messaging/thread-list";
import { REQUEST_STATUS_META } from "@/lib/statuses";
import { formatShowDate, formatDateTime } from "@/lib/dates";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Inbox } from "lucide-react";

export const metadata: Metadata = { title: "Messages" };
export const dynamic = "force-dynamic";

export default async function LabelMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const context = await requireLabelPage();
  const params = await searchParams;
  const defaultTab = params.tab === "messages" ? "messages" : "requests";

  const [{ data: requests }, threads] = await Promise.all([
    serviceDb()
      .from("show_requests")
      .select(
        `id, status, ticket_count, includes_plus_one, message, created_at,
         users:users!creator_id(full_name),
         shows!inner(date, artists(name), venues(city))`,
      )
      .eq("company_id", context.companyId)
      .order("created_at", { ascending: false })
      .limit(200),
    listThreadsFor({ id: context.user.id, side: "company", companyId: context.companyId }),
  ]);

  const grouped = {
    pending: (requests ?? []).filter((r) => r.status === "pending"),
    waitlisted: (requests ?? []).filter((r) => r.status === "waitlisted"),
    decided: (requests ?? []).filter((r) => !["pending", "waitlisted"].includes(r.status)),
  };

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
          <TabsTrigger value="requests">Requests ({grouped.pending.length})</TabsTrigger>
          <TabsTrigger value="messages">Chats ({threads.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="mt-4">
          {!requests?.length ? (
            <EmptyState
              icon={Inbox}
              title="No requests yet"
              description="Publish a show opportunity and creator requests will land here."
            />
          ) : (
            <Tabs defaultValue="pending">
              <TabsList>
                <TabsTrigger value="pending">Pending ({grouped.pending.length})</TabsTrigger>
                <TabsTrigger value="waitlisted">Waitlist ({grouped.waitlisted.length})</TabsTrigger>
                <TabsTrigger value="decided">Decided ({grouped.decided.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="pending" className="mt-4">
                {renderList(grouped.pending, "Nothing pending — nice inbox zero.")}
              </TabsContent>
              <TabsContent value="waitlisted" className="mt-4">
                {renderList(grouped.waitlisted, "No one on the waitlist.")}
              </TabsContent>
              <TabsContent value="decided" className="mt-4">
                {renderList(grouped.decided, "No decided requests yet.")}
              </TabsContent>
            </Tabs>
          )}
        </TabsContent>

        <TabsContent value="messages" className="mt-4">
          <ThreadList threads={threads} basePath="/label/messages" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
