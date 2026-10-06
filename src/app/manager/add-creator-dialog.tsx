"use client";

import { useActionState, useState } from "react";
import { inviteCreatorAction, type InviteState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/submit-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Check, Copy, UserPlus } from "lucide-react";

export function AddCreatorDialog({ agencyName }: { agencyName: string }) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Fresh form (and cleared result) every time the dialog reopens.
        if (!next) setFormKey((k) => k + 1);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="size-4" aria-hidden /> Add creator
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a creator to your roster</DialogTitle>
          <DialogDescription>
            We&apos;ll email them an invite. Once they accept, label conversations and their content
            payouts route through {agencyName}. They keep their own login to browse shows and add
            a card.
          </DialogDescription>
        </DialogHeader>
        <InviteForm key={formKey} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function InviteForm({ onDone }: { onDone: () => void }) {
  const [state, formAction] = useActionState<InviteState, FormData>(inviteCreatorAction, null);
  const [copied, setCopied] = useState(false);

  if (state && "link" in state) {
    return (
      <div className="space-y-4">
        <p className="text-sm">
          Invite sent to <span className="font-medium">{state.email}</span>. You can also send them
          this link directly. It works once and expires in 14 days.
        </p>
        <div className="flex gap-2">
          <Input readOnly value={state.link} aria-label="Invite link" className="font-mono text-xs" />
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(state.link);
              setCopied(true);
            }}
          >
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <Button type="button" className="w-full" onClick={onDone}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="invite-name">Creator&apos;s name</Label>
        <Input id="invite-name" name="fullName" autoComplete="off" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="invite-email">Their email</Label>
        <Input id="invite-email" name="email" type="email" autoComplete="off" required />
      </div>
      {state && "error" in state ? (
        <p role="alert" className="text-sm font-medium text-red-400">
          {state.error}
        </p>
      ) : null}
      <SubmitButton className="w-full" pendingLabel="Sending…">
        Send invite
      </SubmitButton>
    </form>
  );
}
