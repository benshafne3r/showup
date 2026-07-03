"use client";

import { useActionState, useState } from "react";
import { saveCreatorProfile, updateCreatorProfile, type ActionState } from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/submit-button";
import { Plus, Trash2 } from "lucide-react";

type Social = {
  platform: "instagram" | "tiktok" | "youtube" | "twitter" | "twitch" | "other";
  handle: string;
  followers: number;
  avgViews: number;
};

const PLATFORMS: Array<[Social["platform"], string]> = [
  ["instagram", "Instagram"],
  ["tiktok", "TikTok"],
  ["youtube", "YouTube"],
  ["twitter", "X / Twitter"],
  ["twitch", "Twitch"],
  ["other", "Other"],
];

export function OnboardingForm({
  mode,
  initial,
}: {
  mode: "onboarding" | "settings";
  initial: {
    city: string;
    bio: string;
    categories: string;
    audienceSize: number;
    avgViews: number;
    exampleWork: string;
    socials: Social[];
  };
}) {
  const action = mode === "onboarding" ? saveCreatorProfile : updateCreatorProfile;
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);
  const [socials, setSocials] = useState<Social[]>(
    initial.socials.length > 0
      ? initial.socials
      : [{ platform: "tiktok", handle: "", followers: 0, avgViews: 0 }],
  );

  const patchSocial = (index: number, patch: Partial<Social>) =>
    setSocials((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  return (
    <form action={formAction} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Basics</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="city">Your city</Label>
            <Input id="city" name="city" defaultValue={initial.city} placeholder="Los Angeles" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="categories">Content categories</Label>
            <Input
              id="categories"
              name="categories"
              defaultValue={initial.categories}
              placeholder="music, lifestyle, fashion"
              aria-describedby="categories-hint"
            />
            <p id="categories-hint" className="text-xs text-muted-foreground">
              Comma-separated.
            </p>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              name="bio"
              rows={3}
              maxLength={600}
              defaultValue={initial.bio}
              placeholder="What you make, who watches it, and why artist teams should want you in the room."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="audienceSize">Total audience size</Label>
            <Input
              id="audienceSize"
              name="audienceSize"
              type="number"
              min={0}
              defaultValue={initial.audienceSize || ""}
              placeholder="150000"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="avgViews">Average views per post</Label>
            <Input
              id="avgViews"
              name="avgViews"
              type="number"
              min={0}
              defaultValue={initial.avgViews || ""}
              placeholder="40000"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Social accounts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {socials.map((social, index) => (
            <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[140px_1fr_110px_110px_auto]">
              <div>
                <Label htmlFor={`social-platform-${index}`} className="text-xs">Platform</Label>
                <Select
                  value={social.platform}
                  onValueChange={(value) => patchSocial(index, { platform: value as Social["platform"] })}
                >
                  <SelectTrigger id={`social-platform-${index}`} className="mt-1 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor={`social-handle-${index}`} className="text-xs">Handle</Label>
                <Input
                  id={`social-handle-${index}`}
                  className="mt-1"
                  value={social.handle}
                  onChange={(event) => patchSocial(index, { handle: event.target.value })}
                  placeholder="yourhandle"
                />
              </div>
              <div>
                <Label htmlFor={`social-followers-${index}`} className="text-xs">Followers</Label>
                <Input
                  id={`social-followers-${index}`}
                  className="mt-1"
                  type="number"
                  min={0}
                  value={social.followers || ""}
                  onChange={(event) =>
                    patchSocial(index, { followers: parseInt(event.target.value || "0", 10) })
                  }
                />
              </div>
              <div>
                <Label htmlFor={`social-views-${index}`} className="text-xs">Avg views</Label>
                <Input
                  id={`social-views-${index}`}
                  className="mt-1"
                  type="number"
                  min={0}
                  value={social.avgViews || ""}
                  onChange={(event) =>
                    patchSocial(index, { avgViews: parseInt(event.target.value || "0", 10) })
                  }
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${social.platform} account`}
                  onClick={() => setSocials((prev) => prev.filter((_, i) => i !== index))}
                  disabled={socials.length <= 1}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setSocials((prev) =>
                prev.length < 6
                  ? [...prev, { platform: "instagram", handle: "", followers: 0, avgViews: 0 }]
                  : prev,
              )
            }
          >
            <Plus className="size-4" aria-hidden /> Add account
          </Button>
          <input
            type="hidden"
            name="socials"
            value={JSON.stringify(socials.filter((s) => s.handle.trim()))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Example work</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="exampleWork">Links to past content (one per line)</Label>
          <Textarea
            id="exampleWork"
            name="exampleWork"
            rows={3}
            defaultValue={initial.exampleWork}
            placeholder={"https://www.tiktok.com/@you/video/123\nhttps://instagram.com/p/abc"}
          />
        </CardContent>
      </Card>

      {state && "error" in state ? (
        <p role="alert" className="text-sm font-medium text-red-400">{state.error}</p>
      ) : null}
      {state && "success" in state ? (
        <p role="status" className="text-sm font-medium text-emerald-400">{state.success}</p>
      ) : null}
      <SubmitButton size="lg" pendingLabel="Saving…">
        {mode === "onboarding" ? "Finish & start discovering" : "Save profile"}
      </SubmitButton>
    </form>
  );
}
