"use client";

import { useActionState } from "react";
import { submitContentAction, type ActionState } from "../../actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/submit-button";
import { Send } from "lucide-react";

export function ContentForm({ bookingId }: { bookingId: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(submitContentAction, null);

  if (state && "success" in state) {
    return (
      <p role="status" className="text-sm text-emerald-300">
        {state.success}
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="bookingId" value={bookingId} />
      <div className="space-y-1.5">
        <Label htmlFor="post-url">Post URL</Label>
        <Input
          id="post-url"
          name="postUrl"
          type="url"
          placeholder="https://www.tiktok.com/@you/video/…"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="content-proof">Screenshot proof (optional)</Label>
        <Input
          id="content-proof"
          name="proof"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="caption-note">Note (optional)</Label>
        <Textarea
          id="caption-note"
          name="captionNote"
          rows={2}
          maxLength={500}
          placeholder="Performance so far, extra links, anything else"
        />
      </div>
      {state && "error" in state ? (
        <p role="alert" className="text-sm font-medium text-red-400">
          {state.error}
        </p>
      ) : null}
      <SubmitButton pendingLabel="Submitting…">
        <Send className="size-4" aria-hidden />
        Submit for review
      </SubmitButton>
    </form>
  );
}
