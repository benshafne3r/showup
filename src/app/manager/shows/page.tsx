import type { Metadata } from "next";
import { requireManagerPage } from "../require-manager";
import { listRoster } from "@/server/services/agencies";
import { serviceDb } from "@/server/db/service";
import { ShowCard, type ShowCardData } from "@/components/show-card";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { DiscoverFilters } from "@/app/creator/discover-filters";
import { MAJOR_CITIES } from "@/lib/cities";
import { CalendarX2 } from "lucide-react";

export const metadata: Metadata = { title: "Shows" };
export const dynamic = "force-dynamic";

const DELIVERABLE_LABELS: Record<string, string> = {
  instagram_story: "IG Story",
  instagram_reel: "IG Reel",
  instagram_post: "IG Post",
  tiktok_video: "TikTok",
  youtube_short: "YT Short",
  youtube_video: "YT Video",
  twitter_post: "Tweet",
  other: "Content",
};

/** Open opportunities across every city, to request tickets for the roster. */
export default async function ManagerShowsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; city?: string; paid?: string; for?: string }>;
}) {
  const ctx = await requireManagerPage();
  const params = await searchParams;
  const roster = await listRoster(ctx.agencyId);
  const forCreator = roster.find((c) => c.creatorId === params.for);

  const q = params.q?.trim() ?? "";
  // Shopping for one creator → start in their city; otherwise everywhere.
  const cityFilter = params.city ?? (forCreator?.city || "all");
  const paidOnly = params.paid === "1";

  const today = new Date().toISOString().slice(0, 10);
  const { data: rows } = await serviceDb()
    .from("shows")
    .select(
      `id, date, image_url, status, hide_venue_until_approved,
       artists!inner(name, genre, image_url),
       venues!inner(name, city),
       show_opportunities!inner(
         id, creator_payment_cents, tickets_total, tickets_claimed,
         plus_one_allowed, application_deadline, published_at,
         deliverable_requirements(platform, quantity)
       )`,
    )
    .in("status", ["published", "postponed"])
    .gte("date", today)
    .not("show_opportunities.published_at", "is", null)
    .gt("show_opportunities.application_deadline", new Date().toISOString())
    .order("date", { ascending: true })
    .limit(100);

  const rosterCities = roster.map((c) => c.city).filter(Boolean);
  const allCities = Array.from(
    new Set([...MAJOR_CITIES, ...rosterCities, ...(rows ?? []).map((r) => r.venues.city)]),
  ).sort();

  const shows: ShowCardData[] = (rows ?? [])
    .filter((r) => {
      if (cityFilter !== "all" && r.venues.city !== cityFilter) return false;
      if (paidOnly && r.show_opportunities.creator_payment_cents <= 0) return false;
      if (q) {
        const venueTerm = r.hide_venue_until_approved ? "" : r.venues.name;
        const haystack = `${r.artists.name} ${venueTerm} ${r.venues.city}`.toLowerCase();
        if (!haystack.includes(q.toLowerCase())) return false;
      }
      return true;
    })
    .map((r) => {
      const opp = r.show_opportunities;
      const deliverables = opp.deliverable_requirements ?? [];
      return {
        showId: r.id,
        artistName: r.artists.name,
        artistGenre: r.artists.genre,
        imageUrl: r.image_url ?? r.artists.image_url,
        venueName: r.hide_venue_until_approved ? "Secret location" : r.venues.name,
        city: r.venues.city,
        date: r.date,
        creatorPaymentCents: opp.creator_payment_cents,
        deliverableSummary: deliverables.length
          ? deliverables
              .map((d) => `${d.quantity}× ${DELIVERABLE_LABELS[d.platform] ?? d.platform}`)
              .join(" + ")
          : opp.creator_payment_cents > 0
            ? "Content required — details on the show page"
            : "Attend only — no content required",
        ticketsRemaining: Math.max(0, opp.tickets_total - opp.tickets_claimed),
        plusOneAllowed: opp.plus_one_allowed,
      };
    });

  const suffix = forCreator ? `?for=${forCreator.creatorId}` : "";
  return (
    <div className="space-y-6">
      <PageHeader
        title={forCreator ? `Shows for ${forCreator.fullName}` : "Shows"}
        description={
          cityFilter !== "all"
            ? `Open opportunities near ${cityFilter}`
            : "Open opportunities in every city — request tickets for anyone on your roster."
        }
      />
      <DiscoverFilters cities={allCities} activeCity={cityFilter} query={q} paidOnly={paidOnly} />
      {shows.length === 0 ? (
        <EmptyState
          icon={CalendarX2}
          title="No shows match your filters"
          description="Try another city or clear your search — new opportunities are added all the time."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shows.map((show) => (
            <ShowCard key={show.showId} show={show} href={`/manager/shows/${show.showId}${suffix}`} />
          ))}
        </div>
      )}
    </div>
  );
}
