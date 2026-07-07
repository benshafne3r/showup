import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { requireLabelPage } from "../require-label";
import { serviceDb } from "@/server/db/service";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { TourFormDialog } from "./tour-form";
import { TourEditDialog } from "./tour-edit-dialog";
import { formatShowDate } from "@/lib/dates";
import { CalendarPlus, Route } from "lucide-react";

export const metadata: Metadata = { title: "Tours" };
export const dynamic = "force-dynamic";

export default async function ToursPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const context = await requireLabelPage();
  const { welcome } = await searchParams;
  const db = serviceDb();
  const { data: tours } = await db
    .from("tours")
    .select(
      `id, name, description, starts_on, ends_on, artist_id,
       artists(id, name, genre, image_url, bio, instagram_handle, spotify_url),
       shows(id, date, status, venues(city))`,
    )
    .eq("company_id", context.companyId)
    .order("created_at", { ascending: false });

  // Existing artists (those already attached to a tour) for the "existing"
  // picker. Artists with no tour don't surface — this is the Tours-first model.
  const artistOptions = Array.from(
    new Map((tours ?? []).map((t) => [t.artist_id, t.artists?.name ?? ""])).entries(),
  ).map(([id, name]) => ({ id, name }));

  return (
    <div className="space-y-6">
      {welcome ? (
        <div
          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300"
          role="status"
        >
          Company created! Add your first artist while creating their tour, then add show dates.
        </div>
      ) : null}
      <PageHeader
        title="Tours"
        description="Every tour, grouped by artist. Add a new artist while you create their tour."
        action={<TourFormDialog artists={artistOptions} />}
      />
      {!tours?.length ? (
        <EmptyState
          icon={Route}
          title="No tours yet"
          description="Create your first tour — you can add the artist right in the same step, then add show dates to it."
          action={<TourFormDialog artists={artistOptions} />}
        />
      ) : (
        <div className="space-y-4">
          {tours.map((tour) => {
            const artist = tour.artists;
            const shows = [...(tour.shows ?? [])].sort((a, b) => (a.date < b.date ? -1 : 1));
            return (
              <div key={tour.id} className="overflow-hidden rounded-xl border bg-card">
                {/* Artist banner — the Spotify photo (or an upload) as a full-width header. */}
                <div className="artist-card-img relative h-44 w-full overflow-hidden">
                  {artist?.image_url ? (
                    <Image
                      src={artist.image_url}
                      alt={`${artist?.name} banner`}
                      fill
                      sizes="(max-width: 768px) 100vw, 700px"
                      className="object-cover"
                    />
                  ) : null}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-4">
                    <p className="text-sm font-semibold tracking-wide text-white uppercase drop-shadow">
                      {artist?.name}
                      {artist?.genre ? (
                        <span className="font-normal text-white/80"> · {artist.genre}</span>
                      ) : null}
                    </p>
                  </div>
                </div>

                <div className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">{tour.name}</h2>
                      <p className="text-sm text-muted-foreground">
                        {tour.starts_on ? formatShowDate(tour.starts_on) : "Dates TBA"}
                        {tour.ends_on ? ` – ${formatShowDate(tour.ends_on)}` : ""} ·{" "}
                        {shows.length} show{shows.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {artist ? (
                        <TourEditDialog
                          tour={{
                            id: tour.id,
                            name: tour.name,
                            description: tour.description ?? "",
                            startsOn: tour.starts_on ?? "",
                            endsOn: tour.ends_on ?? "",
                          }}
                          artist={{
                            id: artist.id,
                            name: artist.name,
                            genre: artist.genre ?? "",
                            bio: artist.bio ?? "",
                            instagramHandle: artist.instagram_handle ?? "",
                            spotifyUrl: artist.spotify_url ?? "",
                          }}
                        />
                      ) : null}
                      <Button asChild size="sm">
                        <Link href={`/label/shows/new?tour=${tour.id}`}>
                          <CalendarPlus className="size-4" aria-hidden /> Add a date
                        </Link>
                      </Button>
                    </div>
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
                      No dates on this tour yet — use “Add a date”.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
