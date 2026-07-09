"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SpotifyArtistPicker } from "./spotify-artist-picker";
import { cn } from "@/lib/utils";

/**
 * Existing-or-new artist selector shared by the tour + pop-up create forms.
 * Emits the standard field names (`artistId` or `newArtist*`) both actions read.
 */
export function ArtistSelector({ artists }: { artists: { id: string; name: string }[] }) {
  const [mode, setMode] = useState<"existing" | "new">(artists.length > 0 ? "existing" : "new");
  const [newArtist, setNewArtist] = useState({
    name: "",
    genre: "",
    bio: "",
    instagram: "",
    spotifyUrl: "",
    imageUrl: "",
    fromSpotify: false,
  });

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Artist</legend>
      {artists.length > 0 ? (
        <div className="flex gap-1 rounded-lg border p-1" role="tablist">
          {(["existing", "new"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-sm transition-colors",
                mode === m
                  ? "bg-primary/15 font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "existing" ? "Existing artist" : "New artist"}
            </button>
          ))}
        </div>
      ) : null}

      {mode === "existing" && artists.length > 0 ? (
        <Select name="artistId" defaultValue={artists[0]?.id}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Pick an artist" />
          </SelectTrigger>
          <SelectContent>
            {artists.map((artist) => (
              <SelectItem key={artist.id} value={artist.id}>
                {artist.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="space-y-3 rounded-lg border p-3">
          <SpotifyArtistPicker
            selectedName={newArtist.fromSpotify ? newArtist.name : undefined}
            onSelect={(a) =>
              setNewArtist((s) => ({
                name: a.name,
                genre: a.genre,
                bio: a.bio || s.bio,
                instagram: a.instagram || s.instagram,
                spotifyUrl: a.spotifyUrl,
                imageUrl: a.imageUrl ?? "",
                fromSpotify: true,
              }))
            }
          />
          <input type="hidden" name="newArtistSpotifyUrl" value={newArtist.spotifyUrl} />
          <input type="hidden" name="newArtistImageUrl" value={newArtist.imageUrl} />

          {newArtist.imageUrl ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={newArtist.imageUrl} alt="" className="size-12 rounded-lg object-cover" />
              <p className="text-xs text-muted-foreground">Photo pulled from Spotify.</p>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="na-name">Name</Label>
              <Input
                id="na-name"
                name="newArtistName"
                placeholder="Baby Keem"
                required
                value={newArtist.name}
                onChange={(e) => setNewArtist((s) => ({ ...s, name: e.target.value, fromSpotify: false }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="na-genre">Genre</Label>
              <Input
                id="na-genre"
                name="newArtistGenre"
                placeholder="Hip-Hop / Rap"
                value={newArtist.genre}
                onChange={(e) => setNewArtist((s) => ({ ...s, genre: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="na-bio">Bio</Label>
            <Textarea
              id="na-bio"
              name="newArtistBio"
              rows={2}
              maxLength={1000}
              value={newArtist.bio}
              onChange={(e) => setNewArtist((s) => ({ ...s, bio: e.target.value }))}
              placeholder="Auto-filled from Wikipedia when picked from Spotify"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="na-ig">Instagram</Label>
              <Input
                id="na-ig"
                name="newArtistInstagram"
                placeholder="artistname"
                value={newArtist.instagram}
                onChange={(e) => setNewArtist((s) => ({ ...s, instagram: e.target.value }))}
              />
            </div>
            {!newArtist.imageUrl ? (
              <div className="space-y-1.5">
                <Label htmlFor="na-image">Photo</Label>
                <Input id="na-image" name="image" type="file" accept="image/jpeg,image/png,image/webp" />
              </div>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Pick from Spotify to auto-fill photo, bio &amp; Instagram, or enter manually.
          </p>
        </div>
      )}
    </fieldset>
  );
}
