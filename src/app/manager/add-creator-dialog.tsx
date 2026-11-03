"use client";

import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addCreatorAction, findCreatorAction } from "./actions";
import type { RosterCandidate } from "@/server/services/agencies";
import { CreatorAvatar } from "@/components/creator-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { compactCount } from "@/lib/roster";
import { ExternalLink, Loader2, UserPlus } from "lucide-react";

/**
 * Add a creator to the roster from their TikTok: paste a link or @handle, we
 * pull in their name, photo and followers, the manager adjusts the name and
 * adds location and genres. They become a managed profile; nobody is emailed.
 */
export function AddCreatorDialog() {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // A fresh form every time the dialog reopens.
        if (!next) setFormKey((k) => k + 1);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="size-4" aria-hidden /> Add creator
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a creator</DialogTitle>
        </DialogHeader>
        <AddCreatorForm key={formKey} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function AddCreatorForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [link, setLink] = useState("");
  const [candidate, setCandidate] = useState<RosterCandidate | null>(null);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [genres, setGenres] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const find = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const result = await findCreatorAction(link);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setCandidate(result.candidate);
      setName(result.candidate.name);
    });
  };

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!candidate) return;
    setError(null);
    start(async () => {
      const result = await addCreatorAction({
        handle: candidate.handle,
        name,
        location,
        genres: genres.split(",").map((g) => g.trim()).filter(Boolean),
      });
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      toast.success(result && "success" in result ? result.success : "Added to your roster");
      onDone();
      router.refresh();
    });
  };

  if (!candidate) {
    return (
      <form onSubmit={find} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="creator-tiktok">TikTok</Label>
          <Input
            id="creator-tiktok"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="tiktok.com/@handle or @handle"
            autoComplete="off"
            autoFocus
            required
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm font-medium text-red-400">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={pending || !link.trim()}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Find creator
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={add} className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg border p-3">
        <CreatorAvatar name={name || candidate.handle} src={candidate.avatarUrl} size={48} />
        <div className="min-w-0">
          <a
            href={`https://www.tiktok.com/@${candidate.handle}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 truncate text-sm font-medium hover:underline"
          >
            @{candidate.handle}
            <ExternalLink className="size-3 shrink-0 text-muted-foreground" aria-hidden />
          </a>
          <p className="text-xs text-muted-foreground tabular-nums">
            {candidate.found ? `${compactCount(candidate.followers)} followers` : "Couldn't load their TikTok details"}
          </p>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="creator-name">Name</Label>
        <Input id="creator-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="creator-location">Location</Label>
        <Input
          id="creator-location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Los Angeles, CA"
          autoComplete="off"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="creator-genres">Genres</Label>
        <Input
          id="creator-genres"
          value={genres}
          onChange={(e) => setGenres(e.target.value)}
          placeholder="comedy, dance, music"
          autoComplete="off"
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm font-medium text-red-400">
          {error}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-3 pt-1">
        <Button type="button" variant="ghost" onClick={() => setCandidate(null)} disabled={pending}>
          Back
        </Button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">No email is sent</span>
          <Button type="submit" disabled={pending || !name.trim()}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Add to roster
          </Button>
        </div>
      </div>
    </form>
  );
}
