import type { Metadata } from "next";
import Link from "next/link";
import { requireManagerPage } from "./require-manager";
import { listOpenInvites, listRoster } from "@/server/services/agencies";
import { revokeInviteAction } from "./actions";
import { AddCreatorDialog } from "./add-creator-dialog";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/dates";
import { ChevronRight, MapPin, Users } from "lucide-react";

export const metadata: Metadata = { title: "Roster" };
export const dynamic = "force-dynamic";

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const ctx = await requireManagerPage();
  const params = await searchParams;
  const [roster, invites] = await Promise.all([
    listRoster(ctx.agencyId),
    listOpenInvites(ctx.agencyId),
  ]);

  return (
    <div className="space-y-6">
      {params.welcome ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {ctx.agencyName} is set up. Add your first creators to start requesting tickets for them.
        </div>
      ) : null}
      <PageHeader
        title="Roster"
        description="Creators you represent. Label conversations and content payouts for them route to your team."
        action={<AddCreatorDialog agencyName={ctx.agencyName} />}
      />

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
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{creator.fullName}</p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3" aria-hidden />
                      {creator.city || "City not set"}
                      {creator.audienceSize > 0 ? ` · ${compact.format(creator.audienceSize)} audience` : ""}
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <StatusBadge
                    label={creator.hasCard ? "Card on file" : "No card yet"}
                    tone={creator.hasCard ? "success" : "warning"}
                  />
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
