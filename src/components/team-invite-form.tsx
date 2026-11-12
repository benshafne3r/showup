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
import { useRouter } from "next/navigation";
import { sendOwnerTeamRequest } from "./owner-team";

type ActionState = { error: string } | { success: string } | null;

/**
 * Invite a teammate by email as an admin or member (label and management
 * teams). With `owner`, the platform owner is viewing as someone and the
 * invite goes through the owner team endpoint instead of the action.
 */
export function TeamInviteForm({
  action,
  owner,
  placeholder,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  owner?: { kind: "label" | "manager"; orgId: string };
  placeholder: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionState, FormData>(
    owner
      ? async (_prev, formData) => {
          const result = await sendOwnerTeamRequest({
            op: "invite",
            kind: owner.kind,
            orgId: owner.orgId,
            email: String(formData.get("email") ?? ""),
            role: formData.get("role") === "admin" ? "admin" : "member",
          });
          if ("success" in result) router.refresh();
          return result;
        }
      : action,
    null,
  );
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
