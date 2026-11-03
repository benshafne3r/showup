"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { acceptAllForCreatorsAction, acceptForCreatorAction, passForCreatorAction } from "../actions";
import { CreatorAvatar } from "@/components/creator-avatar";
import { ConfirmActionButton } from "@/components/confirm-action-button";
import { Button } from "@/components/ui/button";
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
import { Loader2 } from "lucide-react";

export type WaitingShow = {
  showId: string;
  /** "Baby Keem · Thu, Nov 19 · Los Angeles" */
  title: string;
  /** "Columbia Records · answer by Nov 4, 9:37 PM" */
  detail: string;
  invites: { bookingId: string; creatorName: string; avatarUrl: string | null; hold: string }[];
};

/**
 * Label invites (and approvals) waiting on the agency, grouped by show: accept
 * one, accept all, or pass. Without an agency card there's one note up top
 * instead of a warning on every row.
 */
export function WaitingInvites({ shows, card }: { shows: WaitingShow[]; card: string | null }) {
  const total = shows.reduce((n, s) => n + s.invites.length, 0);
  return (
    <section aria-labelledby="waiting-heading" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="waiting-heading" className="text-sm font-semibold">
          Waiting on you <span className="font-normal text-muted-foreground tabular-nums">{total}</span>
        </h2>
        {card ? (
          <p className="text-xs text-muted-foreground">Holds go on {card}</p>
        ) : (
          <p className="text-sm text-amber-300">
            Add a card to accept.{" "}
            <Link href="/manager/payments" className="underline underline-offset-2">
              Payments
            </Link>
          </p>
        )}
      </div>
      {shows.map((show) => (
        <div key={show.showId} className="overflow-hidden rounded-xl border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{show.title}</p>
              <p className="text-xs text-muted-foreground">{show.detail}</p>
            </div>
            {card && show.invites.length > 1 ? (
              <AcceptAll show={show} card={card} primary={shows.length === 1} />
            ) : null}
          </div>
          <ul className="divide-y">
            {show.invites.map((invite) => (
              <li key={invite.bookingId} className="flex items-center gap-3 px-4 py-2.5">
                <CreatorAvatar name={invite.creatorName} src={invite.avatarUrl} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{invite.creatorName}</span>
                  <span className="block text-xs text-muted-foreground tabular-nums sm:hidden">{invite.hold} hold</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="mr-1 hidden text-xs text-muted-foreground tabular-nums sm:inline">{invite.hold} hold</span>
                  {card ? <AcceptOne invite={invite} card={card} /> : null}
                  <ConfirmActionButton
                    action={passForCreatorAction}
                    fields={{ bookingId: invite.bookingId }}
                    triggerLabel="Pass"
                    title={`Pass for ${invite.creatorName}?`}
                    description="The ticket goes back to the label and they're told your creator can't make it."
                    confirmLabel="Pass"
                    cancelLabel="Keep it"
                  />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function AcceptOne({ invite, card }: { invite: WaitingShow["invites"][number]; card: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const accept = () =>
    start(async () => {
      const fd = new FormData();
      fd.set("bookingId", invite.bookingId);
      fd.set("agreeTerms", "on"); // the dialog is the agreement
      const result = await acceptForCreatorAction(null, fd);
      if (result && "error" in result) {
        toast.error(`${invite.creatorName}: ${result.error}`);
        return;
      }
      toast.success(`Accepted for ${invite.creatorName}`);
      setOpen(false);
      router.refresh();
    });
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          Accept
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Accept for {invite.creatorName}?</AlertDialogTitle>
          <AlertDialogDescription>
            {`A ${invite.hold} hold goes on ${card} a couple of days before the show. It's released when they check in.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button onClick={accept} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Accept
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function AcceptAll({ show, card, primary }: { show: WaitingShow; card: string; primary: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const n = show.invites.length;
  const accept = () =>
    start(async () => {
      const result = await acceptAllForCreatorsAction(show.invites.map((i) => i.bookingId));
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      if (result.accepted) toast.success(`Accepted ${result.accepted} of ${n}`);
      for (const reason of new Set(result.failed)) toast.error(reason);
      setOpen(false);
      router.refresh();
    });
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant={primary ? "default" : "outline"}>
          Accept all {n}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Accept all {n}?</AlertDialogTitle>
          <AlertDialogDescription>
            {`One hold per creator goes on ${card} a couple of days before the show (${show.invites[0].hold} each). Each is released when that creator checks in.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button onClick={accept} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Accept all {n}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
