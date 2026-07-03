"use client";

import { useActionState } from "react";
import { updateSettingsAction, type ActionState } from "../actions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/submit-button";

export function SettingsForm({
  initial,
}: {
  initial: {
    depositPercentageTemplates: string;
    acceptanceWindowHours: number;
    authorizationWindowDays: number;
    paymentMethodGraceDays: number;
    contentDeadlineDefaultDays: number;
  };
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(updateSettingsAction, null);

  return (
    <form action={formAction}>
      <Card>
        <CardContent className="space-y-5 pt-6">
          <div className="space-y-1.5">
            <Label htmlFor="deposit-templates">Deposit percentage templates</Label>
            <Input
              id="deposit-templates"
              name="depositPercentageTemplates"
              defaultValue={initial.depositPercentageTemplates}
              aria-describedby="deposit-templates-hint"
            />
            <p id="deposit-templates-hint" className="text-xs text-muted-foreground">
              Comma-separated percentages offered to labels (e.g. 25, 50, 75, 100). Flat fees are
              never allowed.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="acceptance-hours">Acceptance window (hours)</Label>
              <Input
                id="acceptance-hours"
                name="acceptanceWindowHours"
                type="number"
                min={1}
                max={168}
                defaultValue={initial.acceptanceWindowHours}
              />
              <p className="text-xs text-muted-foreground">
                How long an approved creator has to accept.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="auth-window">Authorization window (days before show)</Label>
              <Input
                id="auth-window"
                name="authorizationWindowDays"
                type="number"
                min={0}
                max={30}
                defaultValue={initial.authorizationWindowDays}
              />
              <p className="text-xs text-muted-foreground">
                When the card hold is placed. Keep within card-network validity (~7 days).
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grace-days">Payment-fix grace period (days)</Label>
              <Input
                id="grace-days"
                name="paymentMethodGraceDays"
                type="number"
                min={0}
                max={30}
                defaultValue={initial.paymentMethodGraceDays}
              />
              <p className="text-xs text-muted-foreground">
                Time a creator gets to fix a failed card before cancellation.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="content-days">Default content deadline (days after show)</Label>
              <Input
                id="content-days"
                name="contentDeadlineDefaultDays"
                type="number"
                min={0}
                max={90}
                defaultValue={initial.contentDeadlineDefaultDays}
              />
            </div>
          </div>
          {state && "error" in state ? (
            <p role="alert" className="text-sm font-medium text-red-400">{state.error}</p>
          ) : null}
          {state && "success" in state ? (
            <p role="status" className="text-sm font-medium text-emerald-400">{state.success}</p>
          ) : null}
          <SubmitButton pendingLabel="Saving…">Save settings</SubmitButton>
        </CardContent>
      </Card>
    </form>
  );
}
