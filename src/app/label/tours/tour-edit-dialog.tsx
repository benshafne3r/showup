"use client";

import { useActionState, useState } from "react";
import { saveTourEditAction, type ActionState } from "../actions";
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
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/submit-button";
import { SpotifyArtistPicker } from "./spotify-artist-picker";
import { Pencil } from "lucide-react";

/** One popup that edits the tour's artist AND the tour together. */
export function TourEditDialog({
  tour,
  artist,
}: {
  tour: { id: string; name: string; description: string; startsOn: string; endsOn: string };
  artist: {
    id: string;
    name: string;
    genre: string;
    bio: string;
    instagramHandle: string;
    spotifyUrl: string;
  };
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveTourEditAction, null);
  const [a, setA] = useState({
    name: artist.name,
    genre: artist.genre,
    bio: artist.bio,
    instagram: artist.instagramHandle,
    spotifyUrl: artist.spotifyUrl,
    imageUrl: "", // a freshly-picked Spotify photo to store (blank = keep current)
    picked: false,
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="size-3.5" aria-hidden /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {tour.name}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-5">
          <input type="hidden" name="tourId" value={tour.id} />
          <input type="hidden" name="artistId" value={artist.id} />
          <input type="hidden" name="artistImageUrl" value={a.imageUrl} />
          <input type="hidden" name="artistSpotifyUrl" value={a.spotifyUrl} />

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">Artist</legend>
            <SpotifyArtistPicker
              selectedName={a.picked ? a.name : undefined}
              onSelect={(picked) =>
                setA((s) => ({
                  ...s,
                  name: picked.name,
                  genre: picked.genre,
                  bio: picked.bio || s.bio,
                  instagram: picked.instagram || s.instagram,
                  spotifyUrl: picked.spotifyUrl,
                  imageUrl: picked.imageUrl ?? "",
                  picked: true,
                }))
              }
            />
            {a.imageUrl ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.imageUrl} alt="" className="size-12 rounded-lg object-cover" />
                <p className="text-xs text-muted-foreground">New photo from Spotify.</p>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="te-name">Name</Label>
                <Input
                  id="te-name"
                  name="artistName"
                  value={a.name}
                  onChange={(e) => setA((s) => ({ ...s, name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="te-genre">Genre</Label>
                <Input
                  id="te-genre"
                  name="artistGenre"
                  value={a.genre}
                  onChange={(e) => setA((s) => ({ ...s, genre: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="te-bio">Bio</Label>
              <Textarea
                id="te-bio"
                name="artistBio"
                rows={3}
                maxLength={1000}
                value={a.bio}
                onChange={(e) => setA((s) => ({ ...s, bio: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="te-ig">Instagram</Label>
              <Input
                id="te-ig"
                name="artistInstagram"
                value={a.instagram}
                onChange={(e) => setA((s) => ({ ...s, instagram: e.target.value }))}
                placeholder="artistname"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="te-image">Or upload a photo</Label>
              <Input id="te-image" name="image" type="file" accept="image/jpeg,image/png,image/webp" />
            </div>
          </fieldset>

          <fieldset className="space-y-3 border-t pt-4">
            <legend className="text-sm font-semibold">Tour</legend>
            <div className="space-y-1.5">
              <Label htmlFor="te-tourname">Tour name</Label>
              <Input id="te-tourname" name="name" defaultValue={tour.name} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="te-desc">Description</Label>
              <Textarea id="te-desc" name="description" rows={2} maxLength={1000} defaultValue={tour.description} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="te-start">Starts</Label>
                <Input id="te-start" name="startsOn" type="date" defaultValue={tour.startsOn} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="te-end">Ends</Label>
                <Input id="te-end" name="endsOn" type="date" defaultValue={tour.endsOn} />
              </div>
            </div>
          </fieldset>

          {state && "error" in state ? (
            <p role="alert" className="text-sm font-medium text-red-400">{state.error}</p>
          ) : null}
          {state && "success" in state ? (
            <p role="status" className="text-sm font-medium text-emerald-400">{state.success}</p>
          ) : null}
          <SubmitButton className="w-full" pendingLabel="Saving…">
            Save changes
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
