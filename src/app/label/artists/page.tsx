import type { Metadata } from "next";
import Image from "next/image";
import { requireLabelPage } from "../require-label";
import { serviceDb } from "@/server/db/service";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ArtistFormDialog } from "./artist-form";
import { Music2 } from "lucide-react";

export const metadata: Metadata = { title: "Artists" };
export const dynamic = "force-dynamic";

export default async function ArtistsPage() {
  const context = await requireLabelPage();
  const { data: artists } = await serviceDb()
    .from("artists")
    .select("id, name, genre, bio, image_url, instagram_handle, spotify_url, shows(id)")
    .eq("company_id", context.companyId)
    .order("name");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Artists"
        description="The roster you book creators for."
        action={<ArtistFormDialog />}
      />
      {!artists?.length ? (
        <EmptyState
          icon={Music2}
          title="No artists yet"
          description="Add your first artist to start creating tours and shows."
          action={<ArtistFormDialog />}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {artists.map((artist) => (
            <div key={artist.id} className="overflow-hidden rounded-xl border bg-card">
              <div className="artist-card-img relative flex aspect-[16/8] items-end overflow-hidden">
                {artist.image_url ? (
                  <Image
                    src={artist.image_url}
                    alt={`${artist.name} image`}
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover"
                  />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                <p className="relative p-4 text-xl font-bold text-white">{artist.name}</p>
              </div>
              <div className="space-y-2 p-4 text-sm">
                <p className="text-muted-foreground">{artist.genre || "—"}</p>
                {artist.bio ? <p className="line-clamp-2 text-xs text-muted-foreground">{artist.bio}</p> : null}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-muted-foreground">
                    {artist.shows?.length ?? 0} show{(artist.shows?.length ?? 0) === 1 ? "" : "s"}
                  </span>
                  <ArtistFormDialog
                    artist={{
                      id: artist.id,
                      name: artist.name,
                      genre: artist.genre,
                      bio: artist.bio,
                      instagramHandle: artist.instagram_handle ?? "",
                      spotifyUrl: artist.spotify_url ?? "",
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
