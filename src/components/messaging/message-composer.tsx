"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { sendMessageAction, type ActionState } from "@/app/creator/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Paperclip, Send } from "lucide-react";

export function MessageComposer({ threadId }: { threadId: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(sendMessageAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state && "success" in state) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2 border-t p-3">
      <input type="hidden" name="threadId" value={threadId} />
      <Label htmlFor={`composer-${threadId}`} className="sr-only">
        Message
      </Label>
      <Textarea
        id={`composer-${threadId}`}
        name="body"
        rows={2}
        maxLength={4000}
        placeholder="Write a message… (contact details stay private, so keep it in the app)"
        onKeyDown={(event) => {
          // Enter sends; Shift+Enter adds a line. Skip while an IME is composing,
          // and on touch keyboards (where Return should just add a line).
          if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
          const touch = window.matchMedia("(pointer: coarse)").matches;
          if (touch && !(event.metaKey || event.ctrlKey)) return;
          event.preventDefault();
          if (event.currentTarget.value.trim() || fileRef.current?.files?.length) {
            event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip className="size-4" aria-hidden /> Attach
          </Button>
          <Input
            ref={fileRef}
            id={`attachments-${threadId}`}
            name="attachments"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            multiple
            className="hidden"
            aria-label="Attach files"
            onChange={(event) => {
              const count = event.target.files?.length ?? 0;
              const label = document.getElementById(`attach-count-${threadId}`);
              if (label) label.textContent = count ? `${count} file${count > 1 ? "s" : ""} attached` : "";
            }}
          />
          <span id={`attach-count-${threadId}`} className="text-xs text-muted-foreground" />
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted-foreground md:inline">
            Enter to send · Shift+Enter for a new line
          </span>
          <SubmitButton size="sm" pendingLabel="Sending…">
            <Send className="size-4" aria-hidden /> Send
          </SubmitButton>
        </div>
      </div>
      {state && "error" in state ? (
        <p role="alert" className="text-sm font-medium text-red-400">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
