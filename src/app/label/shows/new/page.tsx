import type { Metadata } from "next";
import Link from "next/link";
import { requireLabelPage } from "../../require-label";
import { serviceDb } from "@/server/db/service";
import { getPlatformSettings } from "@/server/services/settings";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { ShowForm } from "../show-form";
import { TourShowForm } from "../tour-show-form";
import { CalendarArrowDown, Route } from "lucide-react";

export const metadata: Metadata = { title: "New show" };
export const dynamic = "force-dynamic";

export default async function NewShowPage({
  searchParams,
}: {
  searchParams: Promise<{ tour?: string }>;
}) {
  const context = await requireLabelPage();
  const params = await searchParams;
  const db = serviceDb();
  const [{ data: artists }, { data: tours }, settings] = await Promise.all([
    db.from("artists").select("id, name").eq("company_id", context.companyId).order("name"),
    db
      .from("tours")
      .select("id, name, artist_id, artists(id, name, image_url, spotify_url), shows(date, venues(name))")
      .eq("company_id", context.companyId)
      .order("name"),
    getPlatformSettings(),
  ]);

  if (!artists?.length) {
    return (
      <EmptyState
        icon={Route}
        title="Create a tour first"
        action={
          <Button asChild>
            <Link href="/label/tours">Go to tours</Link>
          </Button>
        }
      />
    );
  }

  // Launched from a tour ("Add a date"): that tour and its artist are fixed,
  // with the artist's announced dates to pick from.
  const fromTour = params.tour ? (tours ?? []).find((t) => t.id === params.tour) : undefined;
  if (fromTour?.artists) {
    const artist = fromTour.artists;
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader title={`Add a date to ${fromTour.name}`} />
        <TourShowForm
          tour={{
            id: fromTour.id,
            name: fromTour.name,
            artist: { id: artist.id, name: artist.name, imageUrl: artist.image_url },
          }}
          spotifyUrl={artist.spotify_url ?? ""}
          existing={(fromTour.shows ?? []).map((show) => ({ date: show.date, venueName: show.venues?.name ?? "" }))}
          baseInitial={{ contentDeadlineDays: settings.contentDeadlineDefaultDays }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Create a show"
        action={
          <Button asChild variant="outline">
            <Link href="/label/shows/import">
              <CalendarArrowDown className="size-4" aria-hidden /> Import dates
            </Link>
          </Button>
        }
      />
      <ShowForm
        artists={artists}
        tours={(tours ?? []).map((t) => ({ id: t.id, name: t.name, artistId: t.artist_id }))}
        initial={{ contentDeadlineDays: settings.contentDeadlineDefaultDays }}
      />
    </div>
  );
}
