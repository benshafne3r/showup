"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/submit-button";

type ActionState = { error: string } | { success: string } | null;

/** Invite a teammate by email as an admin or member (label and management teams). */
export function TeamInviteForm({
  action,
  placeholder,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  placeholder: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="min-w-56 flex-1 space-y-1.5">
        <Label htmlFor="invite-email">Email</Label>
        <Input id="invite-email" name="email" type="email" placeholder={placeholder} required />
      </div>
      <div className="w-36 space-y-1.5">
        <Label htmlFor="invite-role">Role</Label>
        <Select name="role" defaultValue="member">
          <SelectTrigger id="invite-role" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="member">Member</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <SubmitButton pendingLabel="Sending…">Send invite</SubmitButton>
      {state && "error" in state ? (
        <p role="alert" className="w-full text-sm font-medium text-red-400">{state.error}</p>
      ) : null}
      {state && "success" in state ? (
        <p role="status" className="w-full text-sm font-medium text-emerald-400">{state.success}</p>
      ) : null}
    </form>
  );
}
