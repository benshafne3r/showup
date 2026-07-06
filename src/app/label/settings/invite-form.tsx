"use client";

import { useActionState } from "react";
import { inviteMemberAction, type ActionState } from "../actions";
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

export function InviteForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(inviteMemberAction, null);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="min-w-56 flex-1 space-y-1.5">
        <Label htmlFor="invite-email">Email</Label>
        <Input id="invite-email" name="email" type="email" placeholder="teammate@label.com" required />
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
