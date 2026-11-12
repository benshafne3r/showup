import type { Metadata } from "next";
import { requireLabelPage } from "../../require-label";
import { serviceDb } from "@/server/db/service";
import { getPlatformSettings } from "@/server/services/settings";
import { PageHeader } from "@/components/page-header";
import { BulkImportForm } from "../bulk-import-form";

export const metadata: Metadata = { title: "Import tour dates" };
export const dynamic = "force-dynamic";

export default async function ImportShowsPage({
  searchParams,
}: {
  searchParams: Promise<{ tour?: string }>;
}) {
  const context = await requireLabelPage();
  const params = await searchParams;
  const db = serviceDb();
  const [{ data: tours }, settings] = await Promise.all([
    db
      .from("tours")
      .select("id, name, artist_id, artists(name, genre, image_url, spotify_url, bio, instagram_handle)")
      .eq("company_id", context.companyId)
      .order("name"),
    getPlatformSettings(),
  ]);

  // Opened from a tour ("Import dates"): that tour and its artist come preselected.
  const fromTour = params.tour ? (tours ?? []).find((t) => t.id === params.tour) : undefined;
  const tourArtist = fromTour?.artists;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={fromTour ? `Import dates for ${fromTour.name}` : "Import tour dates"} />
      <BulkImportForm
        tours={(tours ?? []).map((t) => ({ id: t.id, name: t.name, artistId: t.artist_id }))}
        contentDeadlineDefaultDays={settings.contentDeadlineDefaultDays}
        initialTourId={fromTour?.id}
        initialArtist={
          tourArtist
            ? {
                name: tourArtist.name,
                genre: tourArtist.genre ?? "",
                imageUrl: tourArtist.image_url,
                spotifyUrl: tourArtist.spotify_url ?? "",
                bio: tourArtist.bio ?? "",
                instagram: tourArtist.instagram_handle ?? "",
              }
            : undefined
        }
      />
    </div>
  );
}
