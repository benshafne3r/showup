"use client";

import { useActionState, useState } from "react";
import { createPartnerLinkAction, type PartnerLinkState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/submit-button";
import { Check, Copy, Link2 } from "lucide-react";

const AUDIENCE = { label: "a label", manager: "a management company" } as const;

function messageFor(state: Extract<PartnerLinkState, { link: string }>): string {
  const expires = new Date(state.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const who = state.kind === "label" ? "label" : "management company";
  return [
    `Hey${state.orgName ? ` ${state.orgName}` : ""}! Here's your private link to join ShowUp as a ${who}.`,
    state.kind === "label"
      ? "ShowUp fills your comp tickets with creators who actually show up and post."
      : "ShowUp gets your roster into shows, keeps label conversations with you, and pays content fees to your company.",
    `Sign up here (takes about a minute): ${state.link}`,
    `The link is just for you, works once, and expires ${expires}.`,
  ].join("\n\n");
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {copied ? "Copied" : label}
    </Button>
  );
}

/** Owner tool: make a private label / management sign-up link and copy it. */
export function PartnerLinkForm() {
  const [state, formAction] = useActionState<PartnerLinkState, FormData>(createPartnerLinkAction, null);
  const [formKey, setFormKey] = useState(0);

  if (state && "link" in state) {
    const message = messageFor(state);
    return (
      <div className="space-y-3">
        <p className="text-sm">
          Private link for {state.orgName || AUDIENCE[state.kind]}
          {state.email ? ` (only ${state.email} can use it)` : ""}. It works once.
        </p>
        <div className="flex gap-2">
          <Input readOnly value={state.link} aria-label="Sign-up link" className="font-mono text-xs" />
          <CopyButton text={state.link} label="Copy link" />
        </div>
        <Label htmlFor="partner-message" className="text-xs text-muted-foreground">
          Or send this message:
        </Label>
        <Textarea id="partner-message" readOnly value={message} rows={6} className="text-sm" />
        <div className="flex flex-wrap gap-2">
          <CopyButton text={message} label="Copy message" />
          <Button type="button" variant="ghost" size="sm" onClick={() => setFormKey((k) => k + 1)}>
            Make another link
          </Button>
        </div>
      </div>
    );
  }

  return <CreateForm key={formKey} formAction={formAction} error={state && "error" in state ? state.error : null} />;
}

function CreateForm({ formAction, error }: { formAction: (fd: FormData) => void; error: string | null }) {
  return (
    <form action={formAction} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Who&apos;s it for?</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["manager", "Management company"],
              ["label", "Label"],
            ] as const
          ).map(([value, label], i) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10"
            >
              <input type="radio" name="kind" value={value} defaultChecked={i === 0} className="accent-primary" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="partner-org">Their company (optional)</Label>
          <Input id="partner-org" name="orgName" placeholder="Spark House" autoComplete="off" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="partner-email">Only this email can use it (optional)</Label>
          <Input id="partner-email" name="email" type="email" placeholder="name@company.com" autoComplete="off" />
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-sm font-medium text-red-400">
          {error}
        </p>
      ) : null}
      <SubmitButton pendingLabel="Creating…">
        <Link2 className="size-4" aria-hidden /> Create sign-up link
      </SubmitButton>
    </form>
  );
}
