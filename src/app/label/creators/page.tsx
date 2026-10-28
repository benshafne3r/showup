import type { Metadata } from "next";
import { requireLabelPage } from "../require-label";
import { serviceDb } from "@/server/db/service";
import { creatorCities, creatorDirectory, SUGGESTION_PAGE } from "@/server/services/offers";
import { CreatorDirectory } from "./creator-directory";
import { PageHeader } from "@/components/page-header";
import { cityKey } from "@/lib/cities";
import { growingLimit } from "@/lib/pagination";
import { formatShowDate } from "@/lib/dates";

export const metadata: Metadata = { title: "Creators" };
export const dynamic = "force-dynamic";

/**
 * The master list of creators on ShowUp: filter by city or search, select as
 * many as you like, and invite them to one of your upcoming shows with a
 * message. Creators with an agency are answered by their agency.
 */
export default async function CreatorsPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string; q?: string; limit?: string }>;
}) {
  const context = await requireLabelPage();
  const params = await searchParams;
  const city = params.city && params.city !== "all" ? params.city.slice(0, 120) : "";
  const query = (params.q ?? "").slice(0, 80);
  const limit = growingLimit(params.limit, SUGGESTION_PAGE, 600);
  const today = new Date().toISOString().slice(0, 10);
  const db = serviceDb();

  const [{ data: rows }, cities, directory, { data: everyone }] = await Promise.all([
    // Shows you can invite to: published, upcoming, still taking requests.
    db
      .from("shows")
      .select(
        "id, date, artists(name), venues!inner(city, state), show_opportunities!inner(id, published_at, application_deadline, tickets_total, tickets_claimed)",
      )
      .eq("company_id", context.companyId)
      .eq("status", "published")
      .gte("date", today)
      .not("show_opportunities.published_at", "is", null)
      .order("date", { ascending: true }),
    creatorCities(),
    creatorDirectory({ companyId: context.companyId, cityKey: city, query, limit }),
    db.rpc("creators_search", { p_city_key: "", p_query: "", p_limit: 1, p_offset: 0 }),
  ]);
  const shows = (rows ?? [])
    .filter((s) => new Date(s.show_opportunities.application_deadline) > new Date())
    .map((s) => ({
      id: s.id,
      label: `${s.artists?.name ?? "Show"} · ${formatShowDate(s.date)} · ${s.venues.city}`,
      cityKey: cityKey(s.venues.city),
      city: s.venues.city,
      ticketsLeft: Math.max(0, s.show_opportunities.tickets_total - s.show_opportunities.tickets_claimed),
    }));

  const more = new URLSearchParams();
  if (city) more.set("city", city);
  if (query) more.set("q", query);
  more.set("limit", String(limit + SUGGESTION_PAGE));

  return (
    <div className="space-y-6">
      <PageHeader title="Creators" />
      <CreatorDirectory
        creators={directory.creators}
        total={directory.total}
        cities={cities}
        allCount={Number(everyone?.[0]?.total ?? 0)}
        city={city}
        query={query}
        shows={shows}
        moreHref={directory.total > limit ? `/label/creators?${more.toString()}` : null}
      />
    </div>
  );
}
