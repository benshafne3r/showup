"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { SpotifyArtistPicker, type PickedArtist } from "./spotify-artist-picker";

/**
 * The artist for the tour + pop-up create forms, picked from Spotify search.
 * Emits the `artist*` fields both actions read; the server reuses the label's
 * artist when they already have it.
 */
export function ArtistSelector() {
  const [artist, setArtist] = useState<PickedArtist | null>(null);

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Artist</legend>
      <SpotifyArtistPicker onSelect={setArtist} />
      {artist ? (
        <div className="flex items-center gap-3 rounded-lg border p-2.5">
          {artist.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={artist.imageUrl} alt="" className="size-10 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="size-10 shrink-0 rounded-full bg-muted" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{artist.name}</span>
            {artist.genre ? (
              <span className="block truncate text-xs text-muted-foreground capitalize">{artist.genre}</span>
            ) : null}
          </span>
          <Check className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </div>
      ) : null}
      <input type="hidden" name="artistName" value={artist?.name ?? ""} />
      <input type="hidden" name="artistGenre" value={artist?.genre ?? ""} />
      <input type="hidden" name="artistBio" value={artist?.bio ?? ""} />
      <input type="hidden" name="artistInstagram" value={artist?.instagram ?? ""} />
      <input type="hidden" name="artistSpotifyUrl" value={artist?.spotifyUrl ?? ""} />
      <input type="hidden" name="artistImageUrl" value={artist?.imageUrl ?? ""} />
    </fieldset>
  );
}
