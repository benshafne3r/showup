import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { userDb } from "@/server/db/server-client";
import { requireCreator } from "@/server/auth/guards";
import { authorizationAmountCents, formatCents } from "@/lib/money";
import { formatShowDateLong, formatShowTime, formatDateTime } from "@/lib/dates";
import { TermsBreakdown } from "@/components/terms-breakdown";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { REQUEST_STATUS_META } from "@/lib/statuses";
import { RequestAccessDialog } from "./request-dialog";
import { CalendarDays, Clock, MapPin, Ticket, Users } from "lucide-react";

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

export default async function ShowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireCreator();
  const { id } = await params;
  const db = await userDb();

  const { data: show } = await db
    .from("shows")
    .select(
      `id, date, doors_time, start_time, status, image_url, ticket_delivery_method,
       artists!inner(name, genre, bio, image_url, instagram_handle),
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
    .maybeSingle();
  if (!show || !show.show_opportunities?.published_at) notFound();

  const opp = show.show_opportunities;
  const remaining = Math.max(0, opp.tickets_total - opp.tickets_claimed);
  const deadlinePassed = new Date(opp.application_deadline) < new Date();
  const deliverables = opp.deliverable_requirements ?? [];

  const { data: existingRequest } = await db
    .from("show_requests")
    .select("id, status")
    .eq("opportunity_id", opp.id)
    .eq("creator_id", user.id)
    .in("status", ["pending", "approved", "waitlisted"])
    .maybeSingle();

  const holdOne = authorizationAmountCents(opp.stated_ticket_value_cents, 1, opp.deposit_percentage);
  const holdTwo = authorizationAmountCents(opp.stated_ticket_value_cents, 2, opp.deposit_percentage);

  return (
    <div className="space-y-6">
      <div className="artist-card-img relative h-56 overflow-hidden rounded-2xl md:h-72">
        {(show.image_url ?? show.artists.image_url) ? (
          <Image
            src={(show.image_url ?? show.artists.image_url)!}
            alt={`${show.artists.name} artist image`}
            fill
            sizes="(max-width: 1024px) 100vw, 1024px"
            className="object-cover"
            priority
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
        <div className="absolute bottom-0 flex w-full flex-wrap items-end justify-between gap-3 p-6">
          <div>
            <p className="text-xs font-medium tracking-wide text-white/70 uppercase">
              {show.artists.genre} · presented by {show.companies.name}
            </p>
            <h1 className="text-3xl font-extrabold tracking-tight text-white md:text-4xl">
              {show.artists.name}
            </h1>
          </div>
          {show.status === "postponed" ? (
            <Badge className="border-transparent bg-amber-500 text-amber-950">Postponed — new date below</Badge>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardContent className="grid gap-3 pt-6 text-sm sm:grid-cols-2">
              <p className="flex items-center gap-2">
                <CalendarDays className="size-4 text-primary" aria-hidden />
                {formatShowDateLong(show.date)}
              </p>
              <p className="flex items-center gap-2">
                <Clock className="size-4 text-primary" aria-hidden />
                {formatShowTime(show.doors_time)
                  ? `Doors ${formatShowTime(show.doors_time)}`
                  : "Doors TBA"}
                {formatShowTime(show.start_time) ? ` · Show ${formatShowTime(show.start_time)}` : ""}
              </p>
              <p className="flex items-center gap-2 sm:col-span-2">
                <MapPin className="size-4 text-primary" aria-hidden />
                {show.venues.name}, {show.venues.city}
                {show.venues.state ? `, ${show.venues.state}` : ""}
                {show.venues.address ? ` — ${show.venues.address}` : ""}
              </p>
              <p className="flex items-center gap-2">
                <Ticket className="size-4 text-primary" aria-hidden />
                {remaining > 0 ? `${remaining} of ${opp.tickets_total} tickets left` : "Fully claimed"}
              </p>
              <p className="flex items-center gap-2">
                <Users className="size-4 text-primary" aria-hidden />
                {opp.plus_one_allowed ? "+1 guest allowed" : "Single tickets only"}
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
                  Complete the deliverables below within {opp.content_deadline_days} days of the
                  show and earn{" "}
                  <span className="font-semibold text-emerald-300">
                    {formatCents(opp.creator_payment_cents)}
                  </span>
                  .
                </p>
              ) : (
                <p>
                  This is an <strong>attend-only</strong> opportunity — enjoy the show, no
                  content required, no additional payment.
                </p>
              )}
              {deliverables.length > 0 ? (
                <ul className="space-y-2">
                  {deliverables.map((d) => (
                    <li key={d.id} className="rounded-lg border bg-muted/40 px-3 py-2">
                      <p className="font-medium">
                        {d.quantity}× {DELIVERABLE_LABELS[d.platform] ?? d.platform}
                      </p>
                      {d.description ? (
                        <p className="text-xs text-muted-foreground">{d.description}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {opp.notes ? <p className="text-xs text-muted-foreground">{opp.notes}</p> : null}
            </CardContent>
          </Card>

          {show.artists.bio ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">About {show.artists.name}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {show.artists.bio}
                {show.artists.instagram_handle ? (
                  <p className="mt-2">
                    Instagram:{" "}
                    <a
                      className="text-primary hover:underline"
                      href={`https://instagram.com/${show.artists.instagram_handle}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      @{show.artists.instagram_handle}
                    </a>
                  </p>
                ) : null}
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
          {opp.plus_one_allowed ? (
            <p className="px-1 text-xs text-muted-foreground">
              With a +1 the temporary hold is {formatCents(holdTwo)} (covers both tickets).
            </p>
          ) : null}

          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">
              Application deadline: {formatDateTime(opp.application_deadline)}
            </p>
            <div className="mt-3">
              {existingRequest ? (
                <div className="flex items-center justify-between gap-3">
                  <StatusBadge {...REQUEST_STATUS_META[existingRequest.status]} />
                  <Link href="/creator/messages?tab=requests" className="text-sm text-primary hover:underline">
                    View request
                  </Link>
                </div>
              ) : deadlinePassed ? (
                <p className="text-sm font-medium text-muted-foreground">
                  Applications have closed for this show.
                </p>
              ) : remaining <= 0 ? (
                <p className="text-sm font-medium text-muted-foreground">
                  All tickets have been claimed.
                </p>
              ) : (
                <RequestAccessDialog
                  opportunityId={opp.id}
                  artistName={show.artists.name}
                  plusOneAllowed={opp.plus_one_allowed}
                  holdOneCents={holdOne}
                  holdTwoCents={holdTwo}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
