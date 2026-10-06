import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { requireManagerPage } from "../../require-manager";
import { listRoster } from "@/server/services/agencies";
import { serviceDb } from "@/server/db/service";
import { authorizationAmountCents, formatCents } from "@/lib/money";
import { formatDateTime, formatShowDateLong, formatShowTime } from "@/lib/dates";
import { REQUEST_STATUS_META } from "@/lib/statuses";
import { TermsBreakdown } from "@/components/terms-breakdown";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RequestForCreatorForm } from "./request-for-creator-form";
import { ArrowLeft, CalendarDays, MapPin, Ticket } from "lucide-react";

export const dynamic = "force-dynamic";

const DELIVERABLE_LABELS: Record<string, string> = {
  instagram_story: "Instagram Story",
  instagram_reel: "Instagram Reel",
  instagram_post: "Instagram Post",
  tiktok_video: "TikTok video",
  youtube_short: "YouTube Short",
  youtube_video: "YouTube video",
  twitter_post: "X / Twitter post",
  other: "Custom deliverable",
};

export default async function ManagerShowPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ for?: string }>;
}) {
  const ctx = await requireManagerPage();
  const { id } = await params;
  const { for: forCreator } = await searchParams;
  const db = serviceDb();

  const { data: show } = await db
    .from("shows")
    .select(
      `id, date, doors_time, start_time, status, image_url, hide_venue_until_approved,
       artists!inner(name, genre, image_url),
       venues!inner(name, city, state, address),
       companies!inner(name),
       show_opportunities!inner(
         id, stated_ticket_value_cents, deposit_percentage, creator_payment_cents,
         plus_one_allowed, tickets_total, tickets_claimed, application_deadline,
         content_deadline_days, notes, published_at,
         deliverable_requirements(id, platform, quantity, description)
       )`,
    )
    .eq("id", id)
    .in("status", ["published", "postponed"])
    .maybeSingle();
  if (!show || !show.show_opportunities?.published_at) notFound();

  const opp = show.show_opportunities;
  const roster = await listRoster(ctx.agencyId);
  const { data: rosterRequests } = roster.length
    ? await db
        .from("show_requests")
        .select("id, creator_id, status")
        .eq("opportunity_id", opp.id)
        .in("creator_id", roster.map((c) => c.creatorId))
        .in("status", ["pending", "approved", "waitlisted"])
    : { data: [] as { id: string; creator_id: string; status: "pending" | "approved" | "waitlisted" }[] };
  const requestedBy = new Map((rosterRequests ?? []).map((r) => [r.creator_id, r.status]));
  const available = roster.filter((c) => !requestedBy.has(c.creatorId));

  // Secret location stays hidden unless one of the roster is approved.
  const locationHidden =
    show.hide_venue_until_approved && ![...requestedBy.values()].includes("approved");

  const remaining = Math.max(0, opp.tickets_total - opp.tickets_claimed);
  const deadlinePassed = new Date(opp.application_deadline) < new Date();
  const holdOne = authorizationAmountCents(opp.stated_ticket_value_cents, 1, opp.deposit_percentage);
  const holdTwo = authorizationAmountCents(opp.stated_ticket_value_cents, 2, opp.deposit_percentage);
  const deliverables = opp.deliverable_requirements ?? [];
  const image = show.image_url ?? show.artists.image_url;

  return (
    <div className="space-y-6">
      <Link href="/manager/shows" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> All shows
      </Link>
      <div className="artist-card-img relative h-48 overflow-hidden rounded-2xl md:h-60">
        {image ? (
          <Image src={image} alt={`${show.artists.name} artist image`} fill sizes="(max-width: 1024px) 100vw, 1024px" className="object-cover" priority />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
        <div className="absolute bottom-0 p-6">
          <p className="text-xs font-medium tracking-wide text-white/70 uppercase">
            {show.artists.genre} · presented by {show.companies.name}
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">{show.artists.name}</h1>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card>
            <CardContent className="grid gap-3 pt-6 text-sm sm:grid-cols-2">
              <p className="flex items-center gap-2">
                <CalendarDays className="size-4 text-primary" aria-hidden />
                {formatShowDateLong(show.date)}
                {formatShowTime(show.start_time) ? ` · ${formatShowTime(show.start_time)}` : ""}
              </p>
              <p className="flex items-center gap-2">
                <Ticket className="size-4 text-primary" aria-hidden />
                {remaining > 0 ? `${remaining} of ${opp.tickets_total} tickets left` : "Fully claimed"}
              </p>
              <p className="flex items-center gap-2 sm:col-span-2">
                <MapPin className="size-4 text-primary" aria-hidden />
                {locationHidden
                  ? `${show.venues.city} · Secret location, revealed once a creator is approved`
                  : `${show.venues.name}, ${show.venues.city}${show.venues.address ? `, ${show.venues.address}` : ""}`}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Deliverables &amp; payment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {opp.creator_payment_cents > 0 ? (
                <p>
                  Deliverables due within {opp.content_deadline_days} days of the show. Pays{" "}
                  <span className="font-semibold text-emerald-300">{formatCents(opp.creator_payment_cents)}</span>{" "}
                  to {ctx.agencyName} once approved.
                </p>
              ) : (
                <p>Attend-only: no content required, no payment.</p>
              )}
              {deliverables.length ? (
                <ul className="space-y-2">
                  {deliverables.map((d) => (
                    <li key={d.id} className="rounded-lg border bg-muted/40 px-3 py-2">
                      <p className="font-medium">
                        {d.quantity}× {DELIVERABLE_LABELS[d.platform] ?? d.platform}
                      </p>
                      {d.description ? <p className="text-xs text-muted-foreground">{d.description}</p> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {opp.notes ? <p className="text-xs text-muted-foreground">{opp.notes}</p> : null}
            </CardContent>
          </Card>
          {requestedBy.size > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Your roster on this show</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {roster
                    .filter((c) => requestedBy.has(c.creatorId))
                    .map((c) => (
                      <li key={c.creatorId} className="flex items-center justify-between gap-2">
                        {c.fullName}
                        <StatusBadge {...REQUEST_STATUS_META[requestedBy.get(c.creatorId)!]} />
                      </li>
                    ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <TermsBreakdown
            statedTicketValueCents={opp.stated_ticket_value_cents}
            depositPercentage={opp.deposit_percentage}
            ticketCount={1}
            authorizationAmountCents={holdOne}
            creatorPaymentCents={opp.creator_payment_cents}
          />
          <div className="rounded-xl border bg-card p-4">
            <p className="mb-3 text-xs text-muted-foreground">
              Application deadline: {formatDateTime(opp.application_deadline)}
            </p>
            {deadlinePassed ? (
              <p className="text-sm font-medium text-muted-foreground">Applications have closed.</p>
            ) : remaining <= 0 ? (
              <p className="text-sm font-medium text-muted-foreground">All tickets have been claimed.</p>
            ) : roster.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                <Link href="/manager" className="text-primary hover:underline">Add creators to your roster</Link>{" "}
                to request tickets.
              </p>
            ) : available.length === 0 ? (
              <p className="text-sm text-muted-foreground">Everyone on your roster has already requested this show.</p>
            ) : (
              <RequestForCreatorForm
                opportunityId={opp.id}
                creators={available.map((c) => ({ id: c.creatorId, name: c.fullName, city: c.city, hasCard: c.hasCard }))}
                defaultCreatorId={available.some((c) => c.creatorId === forCreator) ? forCreator : undefined}
                plusOneAllowed={opp.plus_one_allowed}
                holdOneCents={holdOne}
                holdTwoCents={holdTwo}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
