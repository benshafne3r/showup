import type { Metadata } from "next";
import Link from "next/link";
import { requireLabelPage } from "../require-label";
import { serviceDb } from "@/server/db/service";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { TourFormDialog } from "./tour-form";
import { formatShowDate } from "@/lib/dates";
import { Route } from "lucide-react";

export const metadata: Metadata = { title: "Tours" };
export const dynamic = "force-dynamic";

export default async function ToursPage() {
  const context = await requireLabelPage();
  const db = serviceDb();
  const [{ data: tours }, { data: artists }] = await Promise.all([
    db
      .from("tours")
      .select("id, name, description, starts_on, ends_on, artist_id, artists(name), shows(id, date, status, venues(city))")
      .eq("company_id", context.companyId)
      .order("created_at", { ascending: false }),
    db.from("artists").select("id, name").eq("company_id", context.companyId).order("name"),
  ]);

  const artistOptions = (artists ?? []).map((a) => ({ id: a.id, name: a.name }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tours"
        description="Group shows into tours per artist."
        action={<TourFormDialog artists={artistOptions} />}
      />
      {!tours?.length ? (
        <EmptyState
          icon={Route}
          title="No tours yet"
          description="Create a tour, then add show dates to it — or create standalone shows."
          action={<TourFormDialog artists={artistOptions} />}
        />
      ) : (
        <div className="space-y-4">
          {tours.map((tour) => {
            const shows = [...(tour.shows ?? [])].sort((a, b) => (a.date < b.date ? -1 : 1));
            return (
              <div key={tour.id} className="rounded-xl border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">{tour.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {tour.artists?.name}
                      {tour.starts_on ? ` · ${formatShowDate(tour.starts_on)}` : ""}
                      {tour.ends_on ? ` – ${formatShowDate(tour.ends_on)}` : ""}
                    </p>
                  </div>
                  <TourFormDialog
                    artists={artistOptions}
                    tour={{
                      id: tour.id,
                      artistId: tour.artist_id,
                      name: tour.name,
                      description: tour.description,
                      startsOn: tour.starts_on ?? "",
                      endsOn: tour.ends_on ?? "",
                    }}
                  />
                </div>
                {shows.length ? (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {shows.map((show) => (
                      <li key={show.id}>
                        <Link
                          href={`/label/shows/${show.id}`}
                          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors hover:border-primary/60"
                        >
                          {formatShowDate(show.date)} · {show.venues?.city}
                          {show.status !== "published" ? (
                            <span className="text-muted-foreground">({show.status})</span>
                          ) : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    No shows on this tour yet —{" "}
                    <Link href="/label/shows/new" className="text-primary hover:underline">
                      add one
                    </Link>
                    .
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
