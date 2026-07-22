"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TourCreateForm } from "./tour-form";
import { PopupShowForm } from "./popup-show-form";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";

/** One "Create" button → a tabbed dialog: a full Tour, or a one-off Pop-up show. */
export function CreateDialog({ artists }: { artists: { id: string; name: string }[] }) {
  const [tab, setTab] = useState<"tour" | "popup">("tour");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" aria-hidden /> Create
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[85vh] overflow-y-auto sm:max-w-md"
        // Data-entry form: don't let a native date-picker click, a portaled
        // Select, a stray backdrop click, or Escape collapse a half-filled form.
        // Close only via the X button or a successful submit.
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Create</DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 rounded-lg border p-1" role="tablist">
          {(
            [
              ["tour", "Tour"],
              ["popup", "Event"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-sm transition-colors",
                tab === value
                  ? "bg-primary/15 font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {tab === "tour"
            ? "A tour with an artist — add show dates to it afterward."
            : "A single event in a city — no tour needed, published instantly."}
        </p>

        {tab === "tour" ? (
          <TourCreateForm artists={artists} />
        ) : (
          <PopupShowForm artists={artists} />
        )}
      </DialogContent>
    </Dialog>
  );
}
