import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { userDb } from "@/server/db/server-client";
import { venueDetailsForCreator } from "@/server/services/venues";
import { requireCreator } from "@/server/auth/guards";
import { getCreatorProfile } from "@/server/services/profiles";
import { ShowCard, type ShowCardData } from "@/components/show-card";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { DiscoverFilters } from "./discover-filters";
import { MAJOR_CITIES, cityKey } from "@/lib/cities";
import { serviceDb } from "@/server/db/service";
import { pageOf } from "@/lib/pagination";
import { Pager } from "@/components/pager";
import { enableShowAlertsAction } from "./actions";
import { Button } from "@/components/ui/button";
import { CalendarX2 } from "lucide-react";

export const metadata: Metadata = { title: "Discover shows" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

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
  searchParams: Promise<{ q?: string; city?: string; welcome?: string; page?: string }>;
}) {
  const user = await requireCreator();
  const profile = await getCreatorProfile(user.id);
  if (!profile?.onboarded_at) redirect("/creator/onboarding");

  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  // Default to every city: a creator whose city has no shows yet would otherwise
  // land on an empty Discover. They can still narrow to their city in the filter.
  const cityFilter = params.city ?? "all";

  // Filter and search in the database, then load just this page of shows.
  const { page, size, from } = pageOf(params.page, PAGE_SIZE);
  const service = serviceDb();
  const [{ data: hits, error }, { data: openCities }] = await Promise.all([
    service.rpc("discover_shows", {
      p_city_key: cityFilter !== "all" ? cityKey(cityFilter) : "",
      p_query: q,
      p_limit: size,
      p_offset: from,
    }),
    service.rpc("open_show_cities"),
  ]);
  if (error) throw new Error(`discover: ${error.message}`);
  const ids = (hits ?? []).map((h) => h.show_id);
  const total = Number(hits?.[0]?.total ?? 0);

  const db = await userDb();
  const { data: rows } = ids.length
    ? await db
        .from("shows")
        .select(
          `id, date, image_url, status, hide_venue_until_approved,
           artists!inner(name, genre, image_url),
           venues!inner(city),
           show_opportunities!inner(
             id, creator_payment_cents, tickets_total, tickets_claimed,
             plus_one_allowed, application_deadline, published_at,
             deliverable_requirements(platform, quantity)
           )`,
        )
        .in("id", ids)
    : { data: [] };
  const order = new Map(ids.map((id, i) => [id, i]));
  const sorted = [...(rows ?? [])].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  // Venue names come from the server (secret locations stay hidden).
  const venueOf = await venueDetailsForCreator(user.id, ids);
  const venueName = (r: { id: string; hide_venue_until_approved: boolean }) =>
    r.hide_venue_until_approved ? null : (venueOf.get(r.id)?.name ?? null);

  // Curated major markets, plus every city that currently has an open show.
  const allCities = Array.from(new Set([...MAJOR_CITIES, ...(openCities ?? []).map((c) => c.city)])).sort();

  const shows: ShowCardData[] = sorted.map((r) => {
    const opp = r.show_opportunities;
    const deliverables = opp.deliverable_requirements ?? [];
    return {
      showId: r.id,
      artistName: r.artists.name,
      artistGenre: r.artists.genre,
      imageUrl: r.image_url ?? r.artists.image_url,
      venueName: venueName(r) ?? "Secret location",
      city: r.venues.city,
      date: r.date,
      creatorPaymentCents: opp.creator_payment_cents,
      deliverableSummary: deliverables.length
        ? deliverables.map((d) => `${d.quantity}× ${DELIVERABLE_LABELS[d.platform] ?? d.platform}`).join(" + ")
        : opp.creator_payment_cents > 0
          ? "Content required: details on the show page"
          : "Attend only, no content required",
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
      {!profile.new_show_alerts && profile.city ? (
        <form
          action={enableShowAlertsAction}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-sm"
        >
          <span>
            Get an email when labels post new shows in{" "}
            <span className="font-medium">{profile.city}</span>.
          </span>
          <Button type="submit" size="sm" variant="outline">
            Turn on alerts
          </Button>
        </form>
      ) : null}
      <DiscoverFilters cities={allCities} activeCity={cityFilter} query={q} />
      {shows.length === 0 ? (
        <EmptyState
          icon={CalendarX2}
          title="No shows match your filters"
          description="Try another city or clear your search. New opportunities are added all the time."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shows.map((show) => (
            <ShowCard key={show.showId} show={show} href={`/creator/shows/${show.showId}`} />
          ))}
        </div>
      )}
      <Pager page={page} size={size} total={total} basePath="/creator" params={params} />
    </div>
  );
}
