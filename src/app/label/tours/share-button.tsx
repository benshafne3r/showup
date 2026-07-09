"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Share2, Check } from "lucide-react";

/** Copies (or, on mobile, shares) a public invite link for a tour/event. */
export function ShareButton({ path, label = "Share" }: { path: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function onShare() {
    const url = `${window.location.origin}${path}`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // User dismissed the share sheet, or clipboard was blocked — no-op.
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={onShare}>
      {copied ? (
        <>
          <Check className="size-3.5" aria-hidden /> Copied
        </>
      ) : (
        <>
          <Share2 className="size-3.5" aria-hidden /> {label}
        </>
      )}
    </Button>
  );
}
