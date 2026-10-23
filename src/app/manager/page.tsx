import type { Metadata } from "next";
import Link from "next/link";
import { requireManagerPage } from "./require-manager";
import { listOpenInvites, rosterPage } from "@/server/services/agencies";
import { pendingOffersForAgency } from "@/server/services/offers";
import { agencyDefaultPaymentMethod } from "@/server/services/payments";
import { revokeInviteAction } from "./actions";
import { AddCreatorDialog } from "./add-creator-dialog";
import { OfferActions } from "./offer-actions";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { CreatorAvatar, CreatorPhoto, tiktokUrl } from "@/components/creator-avatar";
import { CreatorFollowers } from "@/components/creator-followers";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatShowDate } from "@/lib/dates";
import { Pager } from "@/components/pager";
import { pageOf } from "@/lib/pagination";
import { ExternalLink, MapPin, Users } from "lucide-react";

export const metadata: Metadata = { title: "Roster" };
export const dynamic = "force-dynamic";

const ROSTER_PAGE = 60;

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string; page?: string }>;
}) {
  const ctx = await requireManagerPage();
  const params = await searchParams;
  const page = pageOf(params.page, ROSTER_PAGE);
  const [{ entries: roster, total: rosterTotal }, invites, offers, card] = await Promise.all([
    rosterPage(ctx.agencyId, { limit: ROSTER_PAGE, offset: page.from }),
    listOpenInvites(ctx.agencyId),
    pendingOffersForAgency(ctx.agencyId),
    agencyDefaultPaymentMethod(ctx.agencyId),
  ]);
  const cardLabel = card ? `${card.brand} •••• ${card.last4}` : null;

  return (
    <div className="space-y-6">
      {params.welcome ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {ctx.agencyName} is set up. Add your first creators to start requesting tickets for them.
        </div>
      ) : null}
      <PageHeader
        title="Roster"
        description="Creators you represent. Labels deal only with your team: invites, conversations, ticket holds and content payouts all route to you."
        action={<AddCreatorDialog agencyName={ctx.agencyName} />}
      />

      {offers.length > 0 ? (
        <section className="space-y-3" aria-label="Waiting on you">
          <h2 className="text-sm font-semibold">Waiting on you ({offers.length})</h2>
          <ul className="divide-y rounded-xl border bg-card">
            {offers.map((offer) => (
              <li key={offer.bookingId} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <Link href={`/manager/bookings/${offer.bookingId}`} className="flex min-w-0 items-start gap-3">
                  <CreatorAvatar name={offer.creatorName} src={offer.avatarUrl} size={36} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium hover:underline">
                      {offer.creatorName} · {offer.artist}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {offer.invited ? `Invited by ${offer.label}` : `Approved by ${offer.label}`} ·{" "}
                      {formatShowDate(offer.date)}
                      {offer.city ? ` · ${offer.city}` : ""} · answer by {formatDateTime(offer.acceptBy)}
                    </p>
                  </div>
                </Link>
                <OfferActions
                  bookingId={offer.bookingId}
                  creatorName={offer.creatorName}
                  hold={offer.hold}
                  card={cardLabel}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {rosterTotal === 0 ? (
        <EmptyState
          icon={Users}
          title="No creators yet"
          description="Add a creator by email. They get an invite to join your roster."
        />
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {roster.map((creator) => (
            <li
              key={creator.creatorId}
              className="flex h-full flex-col overflow-hidden rounded-lg border bg-card transition-colors hover:border-primary/50"
            >
              <CreatorPhoto name={creator.fullName} src={creator.avatarUrl} handle={creator.handle} />
              <div className="flex flex-1 flex-col gap-1 p-2">
                <Link
                  href={`/manager/creators/${creator.creatorId}`}
                  className="truncate text-sm leading-tight font-medium hover:underline"
                >
                  {creator.fullName}
                </Link>
                {creator.handle ? (
                  <a
                    href={tiktokUrl(creator.handle)!}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 truncate text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    <span className="truncate">@{creator.handle}</span>
                    <ExternalLink className="size-3 shrink-0" aria-hidden />
                  </a>
                ) : null}
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <MapPin className="size-3 shrink-0" aria-hidden />
                  <span className="truncate">{creator.location || "No location"}</span>
                </p>
                <CreatorFollowers followers={creator.followers} className="gap-x-2 text-[11px]" />
                {!creator.managedProfile || creator.pendingRequests > 0 || creator.activeBookings > 0 ? (
                  <div className="mt-auto flex flex-wrap gap-1">
                    {!creator.managedProfile ? <StatusBadge label="Own login" tone="neutral" /> : null}
                    {creator.pendingRequests > 0 ? (
                      <StatusBadge label={`${creator.pendingRequests} pending`} tone="info" />
                    ) : null}
                    {creator.activeBookings > 0 ? (
                      <StatusBadge label={`${creator.activeBookings} booked`} tone="neutral" />
                    ) : null}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page.page} size={ROSTER_PAGE} total={rosterTotal} basePath="/manager" params={{}} />

      {invites.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Pending invites ({invites.length})</h2>
          <ul className="divide-y rounded-xl border bg-card">
            {invites.map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{invite.full_name || invite.email}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {invite.email} · sent {formatDateTime(invite.created_at)} · expires{" "}
                    {formatDateTime(invite.expires_at)}
                  </p>
                </div>
                <form action={revokeInviteAction}>
                  <input type="hidden" name="inviteId" value={invite.id} />
                  <Button type="submit" variant="ghost" size="sm">
                    Revoke
                  </Button>
                </form>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            To resend, add the creator again. That replaces the old link.
          </p>
        </section>
      ) : null}
    </div>
  );
}
