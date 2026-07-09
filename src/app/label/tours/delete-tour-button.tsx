"use client";

import { useActionState } from "react";
import { deleteTourAction, type ActionState } from "../actions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { Trash2 } from "lucide-react";

export function DeleteTourButton({
  tourId,
  tourName,
  showCount,
}: {
  tourId: string;
  tourName: string;
  showCount: number;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(deleteTourAction, null);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-red-300 hover:text-red-200">
          <Trash2 className="size-3.5" aria-hidden /> Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {tourName}?</AlertDialogTitle>
          <AlertDialogDescription>
            Permanently removes this tour
            {showCount ? ` and its ${showCount} show${showCount === 1 ? "" : "s"}` : ""}. This
            can&rsquo;t be undone. Shows with creator bookings must be canceled first.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {state && "error" in state ? (
          <p role="alert" className="text-sm font-medium text-red-400">{state.error}</p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Keep tour</AlertDialogCancel>
          <form action={formAction}>
            <input type="hidden" name="tourId" value={tourId} />
            <SubmitButton variant="destructive" pendingLabel="Deleting…">
              Delete
            </SubmitButton>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
