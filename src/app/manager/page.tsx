import type { Metadata } from "next";
import Link from "next/link";
import { requireManagerPage } from "./require-manager";
import { listOpenInvites, listRoster } from "@/server/services/agencies";
import { pendingOffersForAgency } from "@/server/services/offers";
import { agencyDefaultPaymentMethod } from "@/server/services/payments";
import { revokeInviteAction } from "./actions";
import { AddCreatorDialog } from "./add-creator-dialog";
import { OfferActions } from "./offer-actions";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { CreatorAvatar } from "@/components/creator-avatar";
import { CreatorFollowers } from "@/components/creator-followers";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatShowDate } from "@/lib/dates";
import { MapPin, Users } from "lucide-react";

export const metadata: Metadata = { title: "Roster" };
export const dynamic = "force-dynamic";

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const ctx = await requireManagerPage();
  const params = await searchParams;
  const [roster, invites, offers, card] = await Promise.all([
    listRoster(ctx.agencyId),
    listOpenInvites(ctx.agencyId),
    pendingOffersForAgency(ctx.agencyId),
    agencyDefaultPaymentMethod(ctx.agencyId),
  ]);
  const cardLabel = card ? `${card.brand} •••• ${card.last4}` : null;
  roster.sort((a, b) => b.audienceSize - a.audienceSize);

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

      {roster.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No creators yet"
          description="Add a creator by email. They get an invite to join your roster."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {roster.map((creator) => (
            <li key={creator.creatorId}>
              <Link
                href={`/manager/creators/${creator.creatorId}`}
                className="flex h-full flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/50"
              >
                <div className="flex items-start gap-3">
                  <CreatorAvatar name={creator.fullName} src={creator.avatarUrl} size={40} />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{creator.fullName}</p>
                    {creator.handle ? (
                      <p className="truncate text-xs text-muted-foreground">@{creator.handle}</p>
                    ) : null}
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3 shrink-0" aria-hidden />
                      <span className="truncate">{creator.location || "Location not set"}</span>
                    </p>
                  </div>
                </div>
                <CreatorFollowers followers={creator.followers} />
                {creator.tags.length > 0 ? (
                  <p className="truncate text-xs text-muted-foreground">{creator.tags.slice(0, 4).join(" · ")}</p>
                ) : null}
                <div className="mt-auto flex flex-wrap gap-1.5">
                  {!creator.managedProfile ? <StatusBadge label="Has own login" tone="neutral" /> : null}
                  {creator.pendingRequests > 0 ? (
                    <StatusBadge label={`${creator.pendingRequests} pending`} tone="info" />
                  ) : null}
                  {creator.activeBookings > 0 ? (
                    <StatusBadge label={`${creator.activeBookings} active booking${creator.activeBookings > 1 ? "s" : ""}`} tone="neutral" />
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

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
