"use client";

import { useActionState, useState } from "react";
import { usePathname } from "next/navigation";
import { sendSupportMessageAction, type SupportState } from "@/app/support-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/submit-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LifeBuoy } from "lucide-react";

const TOPICS: Array<[string, string]> = [
  ["broken", "Something isn't working"],
  ["payment", "Card, hold or payment"],
  ["account", "Account or sign-in"],
  ["other", "Something else"],
];

/** Header "Help" button: a short form that emails the ShowUp team. */
export function SupportDialog() {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setFormKey((k) => k + 1); // fresh form next time
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Get help">
          <LifeBuoy className="size-4" aria-hidden />
          <span className="hidden sm:inline">Help</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Get help</DialogTitle>
          <DialogDescription>
            Something not working? Tell us and we&apos;ll get back to you by email.
          </DialogDescription>
        </DialogHeader>
        <SupportForm key={formKey} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function SupportForm({ onDone }: { onDone: () => void }) {
  const [state, formAction] = useActionState<SupportState, FormData>(sendSupportMessageAction, null);
  const pathname = usePathname();

  if (state && "sent" in state) {
    return (
      <div className="space-y-4">
        <p role="status" className="text-sm">
          Thanks, we got it. We&apos;ll reply to <span className="font-medium">{state.sent}</span>.
        </p>
        <Button type="button" className="w-full" onClick={onDone}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="page" value={pathname} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">What&apos;s it about?</legend>
        <div className="grid grid-cols-2 gap-2">
          {TOPICS.map(([value, label], i) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10"
            >
              <input type="radio" name="topic" value={value} defaultChecked={i === 0} className="accent-primary" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="space-y-2">
        <Label htmlFor="support-message">What&apos;s happening?</Label>
        <Textarea
          id="support-message"
          name="message"
          rows={5}
          maxLength={4000}
          required
          placeholder="What were you trying to do, and what went wrong?"
        />
        <p className="text-xs text-muted-foreground">
          We&apos;ll see which page you were on, so no need to describe where you are.
        </p>
      </div>
      {state && "error" in state ? (
        <p role="alert" className="text-sm font-medium text-red-400">
          {state.error}
        </p>
      ) : null}
      <SubmitButton className="w-full" pendingLabel="Sending…">
        Send to support
      </SubmitButton>
    </form>
  );
}
