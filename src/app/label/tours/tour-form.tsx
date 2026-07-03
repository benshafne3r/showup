"use client";

import { useActionState } from "react";
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

  return (
    <Dialog>
      <DialogTrigger asChild>
        {editing ? (
          <Button variant="outline" size="sm">
            <Pencil className="size-3.5" aria-hidden /> Edit
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
          <div className="space-y-1.5">
            <Label htmlFor="tour-artist">Artist</Label>
            <Select name="artistId" defaultValue={tour?.artistId || artists[0]?.id}>
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
          <div className="space-y-1.5">
            <Label htmlFor="tour-name">Tour name</Label>
            <Input id="tour-name" name="name" defaultValue={tour?.name ?? ""} placeholder="Coastal Nights Tour 2026" required />
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
