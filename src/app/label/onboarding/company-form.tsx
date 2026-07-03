"use client";

import { useActionState } from "react";
import { createCompanyAction, type ActionState } from "../actions";
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

export function CompanyOnboardingForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(createCompanyAction, null);
  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="company-name">Company name</Label>
        <Input id="company-name" name="name" placeholder="Midnight Bloom Records" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="company-kind">Company type</Label>
        <Select name="kind" defaultValue="label">
          <SelectTrigger id="company-kind" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="label">Record label</SelectItem>
            <SelectItem value="management">Artist management</SelectItem>
            <SelectItem value="agency">Marketing agency</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="company-website">Website (optional)</Label>
        <Input id="company-website" name="website" type="url" placeholder="https://…" />
      </div>
      {state && "error" in state ? (
        <p role="alert" className="text-sm font-medium text-red-400">
          {state.error}
        </p>
      ) : null}
      <SubmitButton className="w-full" pendingLabel="Creating…">
        Create company
      </SubmitButton>
    </form>
  );
}
