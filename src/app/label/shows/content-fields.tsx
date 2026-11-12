"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

export type Deliverable = {
  platform:
    | "instagram_story" | "instagram_reel" | "instagram_post" | "tiktok_video"
    | "youtube_short" | "youtube_video" | "twitter_post" | "other";
  quantity: number;
  description: string;
};

const PLATFORM_LABELS: Array<[Deliverable["platform"], string]> = [
  ["tiktok_video", "TikTok video"],
  ["instagram_reel", "Instagram Reel"],
  ["instagram_story", "Instagram Story"],
  ["instagram_post", "Instagram Post"],
  ["youtube_short", "YouTube Short"],
  ["youtube_video", "YouTube video"],
  ["twitter_post", "X / Twitter post"],
  ["other", "Other"],
];

const QUICK_PLATFORMS: Array<[Deliverable["platform"], string]> = [
  ["tiktok_video", "1 × TikTok"],
  ["instagram_reel", "1 × Instagram Reel"],
  ["instagram_story", "1 × Instagram Story"],
  ["instagram_post", "1 × Instagram Post"],
];

const blankDeliverable = (): Deliverable => ({ platform: "tiktok_video", quantity: 1, description: "" });

/**
 * Content is opt-in: "Require content" reveals the creator payment, what to
 * post and when it's due. Off is attend-only, so the form sends no payment and
 * nothing to post (the actions check the same rule, see contentTerms).
 *  - `list`: an editable list of deliverables (show form)
 *  - `quick`: one post picked from a short list (bulk import, pop-up)
 */
export function ContentFields({
  idPrefix,
  mode,
  initial = {},
  defaultDueDays,
  withDueDays = true,
}: {
  idPrefix: string;
  mode: "list" | "quick";
  initial?: { creatorPayment?: string; contentDeadlineDays?: number; deliverables?: Deliverable[] };
  defaultDueDays: number;
  withDueDays?: boolean;
}) {
  const startsOn = Boolean((initial.creatorPayment && initial.creatorPayment !== "0") || initial.deliverables?.length);
  const [required, setRequired] = useState(startsOn);
  const [deliverables, setDeliverables] = useState<Deliverable[]>(
    initial.deliverables?.length ? initial.deliverables : [blankDeliverable()],
  );

  const patch = (index: number, change: Partial<Deliverable>) =>
    setDeliverables((prev) => prev.map((d, i) => (i === index ? { ...d, ...change } : d)));

  return (
    <div className="space-y-4">
      <label htmlFor={`${idPrefix}-content-required`} className="flex cursor-pointer items-center gap-2.5">
        <Checkbox
          id={`${idPrefix}-content-required`}
          name="contentRequired"
          checked={required}
          onCheckedChange={(checked) => setRequired(checked === true)}
        />
        <span className="text-sm font-medium">Require content</span>
      </label>

      {!required ? (
        <>
          <input type="hidden" name="creatorPayment" value="0" />
          {withDueDays ? <input type="hidden" name="contentDeadlineDays" value={defaultDueDays} /> : null}
          {mode === "list" ? (
            <input type="hidden" name="deliverables" value="[]" />
          ) : (
            <input type="hidden" name="contentPlatform" value="none" />
          )}
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-creator-payment`}>Creator payment (USD)</Label>
              <Input
                id={`${idPrefix}-creator-payment`}
                name="creatorPayment"
                inputMode="decimal"
                placeholder="150"
                defaultValue={initial.creatorPayment && initial.creatorPayment !== "0" ? initial.creatorPayment : ""}
                required
              />
            </div>
            {mode === "quick" ? (
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-content-platform`}>Content</Label>
                <Select name="contentPlatform" defaultValue={initial.deliverables?.[0]?.platform ?? "tiktok_video"}>
                  <SelectTrigger id={`${idPrefix}-content-platform`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {QUICK_PLATFORMS.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {withDueDays ? (
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-content-days`}>Content due (days after show)</Label>
                <Input
                  id={`${idPrefix}-content-days`}
                  name="contentDeadlineDays"
                  type="number"
                  min={0}
                  max={90}
                  defaultValue={initial.contentDeadlineDays ?? defaultDueDays}
                  required
                />
              </div>
            ) : null}
          </div>

          {mode === "list" ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Deliverables</p>
              {deliverables.map((deliverable, index) => (
                <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[170px_80px_1fr_auto]">
                  <div>
                    <Label htmlFor={`${idPrefix}-deliverable-platform-${index}`} className="text-xs">Platform</Label>
                    <Select
                      value={deliverable.platform}
                      onValueChange={(value) => patch(index, { platform: value as Deliverable["platform"] })}
                    >
                      <SelectTrigger id={`${idPrefix}-deliverable-platform-${index}`} className="mt-1 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PLATFORM_LABELS.map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor={`${idPrefix}-deliverable-qty-${index}`} className="text-xs">Qty</Label>
                    <Input
                      id={`${idPrefix}-deliverable-qty-${index}`}
                      className="mt-1"
                      type="number"
                      min={1}
                      max={20}
                      value={deliverable.quantity}
                      onChange={(event) => patch(index, { quantity: parseInt(event.target.value || "1", 10) })}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`${idPrefix}-deliverable-desc-${index}`} className="text-xs">Requirements</Label>
                    <Input
                      id={`${idPrefix}-deliverable-desc-${index}`}
                      className="mt-1"
                      maxLength={300}
                      value={deliverable.description}
                      onChange={(event) => patch(index, { description: event.target.value })}
                      placeholder="≥30s, tag @artist, posted within 48h"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove deliverable"
                      disabled={deliverables.length === 1}
                      onClick={() => setDeliverables((prev) => prev.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                </div>
              ))}
              {deliverables.length < 8 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDeliverables((prev) => [...prev, blankDeliverable()])}
                >
                  <Plus className="size-4" aria-hidden /> Add deliverable
                </Button>
              ) : null}
              <input type="hidden" name="deliverables" value={JSON.stringify(deliverables)} />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
