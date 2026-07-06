"use client";

import { useActionState, useState } from "react";
import { saveTourAction, type ActionState } from "../actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { SubmitButton } from "@/components/submit-button";
import { SpotifyArtistPicker } from "./spotify-artist-picker";
import { cn } from "@/lib/utils";
import { Pencil, Plus } from "lucide-react";

export function TourFormDialog({
  artists,
  tour,
}: {
  artists: { id: string; name: string }[];
  tour?: {
    id: string;
    artistId: string;
    name: string;
    description: string;
    startsOn: string;
    endsOn: string;
  };
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveTourAction, null);
  const editing = !!tour;
  // In create mode, choose an existing artist or add a new one inline.
  const [mode, setMode] = useState<"existing" | "new">(
    artists.length > 0 ? "existing" : "new",
  );
  // New-artist fields — pre-filled by the Spotify picker, still editable.
  const [newArtist, setNewArtist] = useState({
    name: "",
    genre: "",
    spotifyUrl: "",
    imageUrl: "",
    fromSpotify: false,
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        {editing ? (
          <Button variant="outline" size="sm">
            <Pencil className="size-3.5" aria-hidden /> Edit tour
          </Button>
        ) : (
          <Button>
            <Plus className="size-4" aria-hidden /> New tour
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${tour.name}` : "Create tour"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {editing ? <input type="hidden" name="tourId" value={tour.id} /> : null}

          {/* Artist: pick existing or add new (create mode only) */}
          {editing ? (
            <div className="space-y-1.5">
              <Label htmlFor="tour-artist">Artist</Label>
              <Select name="artistId" defaultValue={tour.artistId}>
                <SelectTrigger id="tour-artist" className="w-full">
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
            </div>
          ) : (
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
                  <SelectTrigger id="tour-artist" className="w-full">
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
                      setNewArtist({
                        name: a.name,
                        genre: a.genre,
                        spotifyUrl: a.spotifyUrl,
                        imageUrl: a.imageUrl ?? "",
                        fromSpotify: true,
                      })
                    }
                  />
                  {/* Captured from the Spotify selection; server fetches + stores the photo. */}
                  <input type="hidden" name="newArtistSpotifyUrl" value={newArtist.spotifyUrl} />
                  <input type="hidden" name="newArtistImageUrl" value={newArtist.imageUrl} />

                  {newArtist.imageUrl ? (
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={newArtist.imageUrl}
                        alt=""
                        className="size-12 rounded-lg object-cover"
                      />
                      <p className="text-xs text-muted-foreground">Photo pulled from Spotify.</p>
                    </div>
                  ) : null}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="new-artist-name">Name</Label>
                      <Input
                        id="new-artist-name"
                        name="newArtistName"
                        placeholder="Baby Keem"
                        required={mode === "new"}
                        value={newArtist.name}
                        onChange={(e) =>
                          setNewArtist((s) => ({ ...s, name: e.target.value, fromSpotify: false }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="new-artist-genre">Genre</Label>
                      <Input
                        id="new-artist-genre"
                        name="newArtistGenre"
                        placeholder="Hip-Hop / Rap"
                        value={newArtist.genre}
                        onChange={(e) => setNewArtist((s) => ({ ...s, genre: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="new-artist-ig">Instagram</Label>
                      <Input id="new-artist-ig" name="newArtistInstagram" placeholder="artistname" />
                    </div>
                    {!newArtist.imageUrl ? (
                      <div className="space-y-1.5">
                        <Label htmlFor="new-artist-image">Photo</Label>
                        <Input id="new-artist-image" name="image" type="file" accept="image/jpeg,image/png,image/webp" />
                      </div>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Pick from Spotify to auto-fill the photo, or enter details manually.
                  </p>
                </div>
              )}
            </fieldset>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="tour-name">Tour name</Label>
            <Input id="tour-name" name="name" defaultValue={tour?.name ?? ""} placeholder="The Ca$ino Tour 2026" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tour-description">Description</Label>
            <Textarea id="tour-description" name="description" rows={2} maxLength={1000} defaultValue={tour?.description ?? ""} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tour-start">Starts</Label>
              <Input id="tour-start" name="startsOn" type="date" defaultValue={tour?.startsOn ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tour-end">Ends</Label>
              <Input id="tour-end" name="endsOn" type="date" defaultValue={tour?.endsOn ?? ""} />
            </div>
          </div>
          {state && "error" in state ? (
            <p role="alert" className="text-sm font-medium text-red-400">{state.error}</p>
          ) : null}
          {state && "success" in state ? (
            <p role="status" className="text-sm font-medium text-emerald-400">{state.success}</p>
          ) : null}
          <SubmitButton className="w-full" pendingLabel="Saving…">
            {editing ? "Save changes" : "Create tour"}
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
