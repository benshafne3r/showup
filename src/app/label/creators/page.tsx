import type { Metadata } from "next";
import Link from "next/link";
import { requireLabelPage } from "../require-label";
import { serviceDb } from "@/server/db/service";
import { creatorCountsNear, SUGGESTION_PAGE, suggestCreatorsForShow } from "@/server/services/offers";
import { PickCreators } from "../shows/[id]/pick-creators";
import { CitySelect } from "./city-select";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cityKey } from "@/lib/cities";
import { growingLimit } from "@/lib/pagination";
import { formatShowDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Users } from "lucide-react";

export const metadata: Metadata = { title: "Creators" };
export const dynamic = "force-dynamic";

/**
 * Find creators by city and invite them: pick one of the cities you have
 * upcoming shows in, choose the show, check the creators. Creators with an
 * agency are answered by their agency.
 */
export default async function CreatorsPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string; show?: string; limit?: string }>;
}) {
  const context = await requireLabelPage();
  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);

  const { data: rows } = await serviceDb()
    .from("shows")
    .select(
      "id, date, artists(name), venues!inner(city, state), show_opportunities!inner(id, published_at, tickets_total, tickets_claimed)",
    )
    .eq("company_id", context.companyId)
    .eq("status", "published")
    .gte("date", today)
    .not("show_opportunities.published_at", "is", null)
    .order("date", { ascending: true });
  const shows = rows ?? [];

  if (!shows.length) {
    return (
      <div className="space-y-6">
        <PageHeader title="Creators" description="Find creators by city and invite them to your shows." />
        <EmptyState
          icon={Users}
          title="No upcoming shows"
          description="Publish a show, then come back to invite creators in that city."
          action={
            <Button asChild>
              <Link href="/label/tours">Go to Shows</Link>
            </Button>
          }
        />
      </div>
    );
  }

  // One entry per city you have upcoming shows in.
  const cities = new Map<string, { label: string; venue: { city: string; state: string | null }; shows: typeof shows }>();
  for (const show of shows) {
    const key = cityKey(show.venues.city);
    const entry = cities.get(key) ?? { label: show.venues.city, venue: show.venues, shows: [] };
    entry.shows.push(show);
    cities.set(key, entry);
  }
  const entries = [...cities.entries()];
  const rawCounts = await creatorCountsNear(entries.map(([, c]) => c.venue));
  // Cities with the most creators first: that's where invites go furthest.
  const order = entries
    .map((entry, i) => ({ entry, n: rawCounts[i] }))
    .sort((a, b) => b.n.inCity + b.n.nearby - (a.n.inCity + a.n.nearby));
  const cityList = order.map((o) => o.entry);
  const counts = order.map((o) => o.n);

  const [cityKeySelected, city] = cityList.find(([key]) => key === params.city) ?? cityList[0];
  const show = city.shows.find((s) => s.id === params.show) ?? city.shows[0];
  const limit = growingLimit(params.limit, SUGGESTION_PAGE, 600);
  const suggestions = await suggestCreatorsForShow({ companyId: context.companyId, showId: show.id, limit });
  const opp = show.show_opportunities;
  const moreHref =
    suggestions && (suggestions.inCityTotal > limit || suggestions.nearbyTotal > limit)
      ? `/label/creators?city=${encodeURIComponent(cityKeySelected)}&show=${show.id}&limit=${limit + SUGGESTION_PAGE}`
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Creators"
        description="Pick a city, choose the show, and check the creators you want. Creators with an agency are answered by their agency."
      />

      <CitySelect
        selected={cityKeySelected}
        cities={cityList.map(([key, c], i) => ({ key, label: c.label, inCity: counts[i].inCity, nearby: counts[i].nearby }))}
      />

      <Card>
        <CardContent className="space-y-5 pt-6">
          <div className="space-y-2">
            <p className="text-sm font-medium">Invite them to</p>
            <div className="flex flex-wrap gap-2">
              {city.shows.map((s) => (
                <Link
                  key={s.id}
                  href={`/label/creators?city=${encodeURIComponent(cityKeySelected)}&show=${s.id}`}
                  aria-current={s.id === show.id ? "true" : undefined}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                    s.id === show.id
                      ? "border-primary bg-primary/10 font-medium"
                      : "text-muted-foreground hover:border-primary/50 hover:text-foreground",
                  )}
                >
                  {s.artists?.name ?? "Show"} · {formatShowDate(s.date)}
                </Link>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              <Link href={`/label/shows/${show.id}`} className="underline underline-offset-2 hover:text-foreground">
                Open this show
              </Link>{" "}
              · {Math.max(0, opp.tickets_total - opp.tickets_claimed)} tickets left
            </p>
          </div>

          {suggestions ? (
            <PickCreators
              key={show.id}
              showId={show.id}
              city={suggestions.city}
              inCity={suggestions.inCity}
              nearby={suggestions.nearby}
              inCityTotal={suggestions.inCityTotal}
              nearbyTotal={suggestions.nearbyTotal}
              moreHref={moreHref}
              ticketsLeft={Math.max(0, opp.tickets_total - opp.tickets_claimed)}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

