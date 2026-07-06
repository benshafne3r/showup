"use client";

import { useActionState } from "react";
import { saveArtistAction, type ActionState } from "../actions";
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
import { Pencil, Plus } from "lucide-react";

type ArtistInput = {
  id: string;
  name: string;
  genre: string;
  bio: string;
  instagramHandle: string;
  spotifyUrl: string;
};

export function ArtistFormDialog({ artist }: { artist?: ArtistInput }) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveArtistAction, null);
  const editing = !!artist;

  return (
    <Dialog>
      <DialogTrigger asChild>
        {editing ? (
          <Button variant="outline" size="sm">
            <Pencil className="size-3.5" aria-hidden /> Edit artist
          </Button>
        ) : (
          <Button>
            <Plus className="size-4" aria-hidden /> Add artist
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${artist.name}` : "Add artist"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {editing ? <input type="hidden" name="artistId" value={artist.id} /> : null}
          <div className="space-y-1.5">
            <Label htmlFor="artist-name">Name</Label>
            <Input id="artist-name" name="name" defaultValue={artist?.name ?? ""} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="artist-genre">Genre</Label>
            <Input id="artist-genre" name="genre" defaultValue={artist?.genre ?? ""} placeholder="Indie Pop" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="artist-bio">Bio</Label>
            <Textarea id="artist-bio" name="bio" rows={3} maxLength={1000} defaultValue={artist?.bio ?? ""} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="artist-ig">Instagram handle</Label>
              <Input id="artist-ig" name="instagramHandle" defaultValue={artist?.instagramHandle ?? ""} placeholder="artistname" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="artist-spotify">Spotify URL</Label>
              <Input id="artist-spotify" name="spotifyUrl" type="url" defaultValue={artist?.spotifyUrl ?? ""} placeholder="https://open.spotify.com/…" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="artist-image">Artist image</Label>
            <Input id="artist-image" name="image" type="file" accept="image/jpeg,image/png,image/webp" />
            <p className="text-xs text-muted-foreground">Used on discovery cards — landscape works best.</p>
          </div>
          {state && "error" in state ? (
            <p role="alert" className="text-sm font-medium text-red-400">{state.error}</p>
          ) : null}
          {state && "success" in state ? (
            <p role="status" className="text-sm font-medium text-emerald-400">{state.success}</p>
          ) : null}
          <SubmitButton className="w-full" pendingLabel="Saving…">
            {editing ? "Save changes" : "Add artist"}
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
