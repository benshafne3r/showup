import type { Metadata } from "next";
import Link from "next/link";
import { requireManagerPage } from "./require-manager";
import { rosterPage } from "@/server/services/agencies";
import { AddCreatorDialog } from "./add-creator-dialog";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { CreatorPhoto, tiktokUrl } from "@/components/creator-avatar";
import { CreatorFollowers } from "@/components/creator-followers";
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
  const { entries: roster, total: rosterTotal } = await rosterPage(ctx.agencyId, { limit: ROSTER_PAGE, offset: page.from });

  return (
    <div className="space-y-6">
      {params.welcome ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {ctx.agencyName} is set up. Add your first creators to start requesting tickets for them.
        </div>
      ) : null}
      <PageHeader title="Roster" action={<AddCreatorDialog />} />

      {rosterTotal === 0 ? (
        <EmptyState
          icon={Users}
          title="No creators yet"
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

    </div>
  );
}
