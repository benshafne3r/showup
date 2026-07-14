import { notFound } from "next/navigation";
import Link from "next/link";
import { requireLabelPage } from "../../require-label";
import { serviceDb } from "@/server/db/service";
import { getCreatorPublicProfile } from "@/server/services/profiles";
import { authorizationAmountCents, formatCents } from "@/lib/money";
import { formatShowDateLong, formatDateTime } from "@/lib/dates";
import { StatusBadge } from "@/components/status-badge";
import { REQUEST_STATUS_META } from "@/lib/statuses";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReviewActions } from "./review-actions";
import { ExternalLink, MessageSquare, Users } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function RequestReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireLabelPage();
  const { id } = await params;
  const db = serviceDb();

  const { data: request } = await db
    .from("show_requests")
    .select(
      `id, status, ticket_count, includes_plus_one, message, created_at, creator_id,
       decided_at,
       shows!inner(id, date, artists(name), venues(name, city)),
       show_opportunities!inner(
         stated_ticket_value_cents, deposit_percentage, creator_payment_cents,
         tickets_total, tickets_claimed, plus_one_allowed
       ),
       bookings(id, status)`,
    )
    .eq("id", id)
    .eq("company_id", context.companyId)
    .maybeSingle();
  if (!request) notFound();

  const creator = await getCreatorPublicProfile(request.creator_id);
  const { data: thread } = await db
    .from("message_threads")
    .select("id")
    .eq("request_id", request.id)
    .maybeSingle();

  const opp = request.show_opportunities;
  const remaining = opp.tickets_total - opp.tickets_claimed;
  const holdRequested = authorizationAmountCents(
    opp.stated_ticket_value_cents,
    request.ticket_count,
    opp.deposit_percentage,
  );

  // Creator's history with the platform (visible signal for reviewers).
  const { data: history } = await db
    .from("bookings")
    .select("status")
    .eq("creator_id", request.creator_id);
  const attended = (history ?? []).filter((b) => ["attended", "completed"].includes(b.status)).length;
  const noShows = (history ?? []).filter((b) => b.status === "canceled").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/label/messages?tab=requests" className="hover:underline">Requests</Link> / review
          </p>
          <h1 className="text-2xl font-bold tracking-tight">
            {creator?.fullName ?? "Creator"} → {request.shows.artists?.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {formatShowDateLong(request.shows.date)} · {request.shows.venues?.name},{" "}
            {request.shows.venues?.city}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge {...REQUEST_STATUS_META[request.status]} />
          {thread ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/label/messages/${thread.id}`}>
                <MessageSquare className="size-4" aria-hidden /> Message
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Creator profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {creator?.profile ? (
                <>
                  <div className="flex flex-wrap gap-x-8 gap-y-2">
                    <p>
                      <span className="text-muted-foreground">City:</span>{" "}
                      <strong>{creator.profile.city}</strong>
                    </p>
                    <p>
                      <span className="text-muted-foreground">Audience:</span>{" "}
                      <strong>{creator.profile.audience_size.toLocaleString()}</strong>
                    </p>
                    <p>
                      <span className="text-muted-foreground">Avg views:</span>{" "}
                      <strong>{creator.profile.avg_views.toLocaleString()}</strong>
                    </p>
                    <p>
                      <span className="text-muted-foreground">Categories:</span>{" "}
                      <strong>{creator.profile.categories.join(", ") || "—"}</strong>
                    </p>
                  </div>
                  {creator.profile.bio ? (
                    <p className="text-muted-foreground">{creator.profile.bio}</p>
                  ) : null}
                  {creator.profile.creator_social_accounts?.length ? (
                    <ul className="space-y-1.5">
                      {creator.profile.creator_social_accounts.map((social) => (
                        <li key={social.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                          <span>
                            <span className="font-medium capitalize">{social.platform}</span>{" "}
                            @{social.handle}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {social.followers.toLocaleString()} followers ·{" "}
                            {social.avg_views.toLocaleString()} avg views
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {Array.isArray(creator.profile.example_work) &&
                  (creator.profile.example_work as string[]).length ? (
                    <div>
                      <p className="mb-1 font-medium">Example work</p>
                      <ul className="space-y-1">
                        {(creator.profile.example_work as string[]).map((url) => (
                          <li key={url}>
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              {url} <ExternalLink className="size-3" aria-hidden />
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-muted-foreground">This creator hasn't completed their profile.</p>
              )}
              <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                ShowUp history: {attended} attended · {noShows} canceled/no-show ·{" "}
                member since {creator ? formatDateTime(creator.memberSince) : "—"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="size-4 text-primary" aria-hidden />
                The request
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                <strong>
                  {request.ticket_count} ticket{request.ticket_count > 1 ? "s" : ""}
                </strong>
                {request.includes_plus_one ? " — includes a +1 guest" : ""} · requested{" "}
                {formatDateTime(request.created_at)}
              </p>
              {request.message ? (
                <blockquote className="rounded-lg border-l-2 border-primary/60 bg-muted/40 px-4 py-3 italic">
                  “{request.message}”
                </blockquote>
              ) : (
                <p className="text-muted-foreground">No pitch message included.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Terms if approved</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Stated ticket value</span>
                <span>{formatCents(opp.stated_ticket_value_cents)} / ticket</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Deposit</span>
                <span>{opp.deposit_percentage}%</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Hold ({request.ticket_count} tickets)</span>
                <span>{formatCents(holdRequested)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Creator payment</span>
                <span>
                  {opp.creator_payment_cents > 0 ? formatCents(opp.creator_payment_cents) : "attend-only"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Inventory left</span>
                <span className={remaining < request.ticket_count ? "font-medium text-red-300" : ""}>
                  {remaining} of {opp.tickets_total}
                </span>
              </div>
            </CardContent>
          </Card>

          {["pending", "waitlisted"].includes(request.status) ? (
            <ReviewActions
              requestId={request.id}
              requestedTickets={request.ticket_count as 1 | 2}
              includesPlusOne={request.includes_plus_one}
              remaining={remaining}
            />
          ) : request.bookings ? (
            <Button asChild className="w-full">
              <Link href={`/label/bookings/${request.bookings.id}`}>View booking</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
