"use client";

import { useActionState } from "react";
import { deleteShowAction, type ActionState } from "../actions";
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

export function DeleteShowButton({ showId, showLabel }: { showId: string; showLabel: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(deleteShowAction, null);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-red-300 hover:text-red-200" aria-label="Delete show">
          <Trash2 className="size-3.5" aria-hidden />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this show?</AlertDialogTitle>
          <AlertDialogDescription>
            Permanently removes {showLabel}. This can&rsquo;t be undone. Shows with creator
            bookings must be canceled first.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {state && "error" in state ? (
          <p role="alert" className="text-sm font-medium text-red-400">{state.error}</p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Keep show</AlertDialogCancel>
          <form action={formAction}>
            <input type="hidden" name="showId" value={showId} />
            <SubmitButton variant="destructive" pendingLabel="Deleting…">
              Delete
            </SubmitButton>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
