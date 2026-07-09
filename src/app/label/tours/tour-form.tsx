"use client";

import { useActionState } from "react";
import { saveTourAction, type ActionState } from "../actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/submit-button";
import { ArtistSelector } from "./artist-selector";

/**
 * The "create tour" form body (no dialog wrapper), rendered inside the Create
 * dialog's "Tour" tab: an existing/new artist selector plus the tour fields.
 */
export function TourCreateForm({ artists }: { artists: { id: string; name: string }[] }) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveTourAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <ArtistSelector artists={artists} />

      <div className="space-y-1.5">
        <Label htmlFor="tour-name">Tour name</Label>
        <Input id="tour-name" name="name" placeholder="The Ca$ino Tour 2026" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tour-description">Description</Label>
        <Textarea id="tour-description" name="description" rows={2} maxLength={1000} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="tour-start">Starts</Label>
          <Input id="tour-start" name="startsOn" type="date" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tour-end">Ends</Label>
          <Input id="tour-end" name="endsOn" type="date" />
        </div>
      </div>
      {state && "error" in state ? (
        <p role="alert" className="text-sm font-medium text-red-400">{state.error}</p>
      ) : null}
      {state && "success" in state ? (
        <p role="status" className="text-sm font-medium text-emerald-400">{state.success}</p>
      ) : null}
      <SubmitButton className="w-full" pendingLabel="Saving…">
        Create tour
      </SubmitButton>
    </form>
  );
}
