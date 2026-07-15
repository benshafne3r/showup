import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { userDb } from "@/server/db/server-client";
import { requireCreator } from "@/server/auth/guards";
import { getCreatorProfile } from "@/server/services/profiles";
import { ShowCard, type ShowCardData } from "@/components/show-card";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { DiscoverFilters } from "./discover-filters";
import { MAJOR_CITIES } from "@/lib/cities";
import { CalendarX2 } from "lucide-react";

export const metadata: Metadata = { title: "Discover shows" };
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

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; city?: string; paid?: string; welcome?: string }>;
}) {
  const user = await requireCreator();
  const profile = await getCreatorProfile(user.id);
  if (!profile?.onboarded_at) redirect("/creator/onboarding");

  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const cityFilter = params.city ?? profile.city ?? "";
  const paidOnly = params.paid === "1";

  const db = await userDb();
  const today = new Date().toISOString().slice(0, 10);
  const { data: rows } = await db
    .from("shows")
    .select(
      `id, date, image_url, status,
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
    .limit(60);

  // Curated major markets, plus any city that currently has a published show.
  const allCities = Array.from(
    new Set([...MAJOR_CITIES, ...(rows ?? []).map((r) => r.venues.city)]),
  ).sort();

  const shows: ShowCardData[] = (rows ?? [])
    .filter((r) => {
      const opp = r.show_opportunities;
      if (cityFilter && cityFilter !== "all" && r.venues.city !== cityFilter) return false;
      if (paidOnly && opp.creator_payment_cents <= 0) return false;
      if (q) {
        const haystack = `${r.artists.name} ${r.venues.name} ${r.venues.city}`.toLowerCase();
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
        venueName: r.venues.name,
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

  return (
    <div className="space-y-6">
      {params.welcome ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          Welcome to ShowUp, {user.fullName.split(" ")[0] || "creator"}! Here are shows near you.
        </div>
      ) : null}
      <PageHeader
        title="Discover shows"
        description={
          cityFilter && cityFilter !== "all"
            ? `Complimentary access near ${cityFilter}`
            : "Complimentary access in every city"
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
            <ShowCard key={show.showId} show={show} href={`/creator/shows/${show.showId}`} />
          ))}
        </div>
      )}
    </div>
  );
}
