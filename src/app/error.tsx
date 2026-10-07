"use client";

import { useEffect, useSyncExternalStore } from "react";
import { reportError } from "@/lib/report-error";
import { Button } from "@/components/ui/button";
import { Eye, TriangleAlert } from "lucide-react";

/** Set alongside the (httpOnly) view-as cookie so the browser can tell. */
const VIEWING_FLAG = "showup_viewing=";
const isViewingAs = () => document.cookie.split("; ").some((c) => c.startsWith(VIEWING_FLAG));
const noSubscribe = () => () => {};

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // While the owner is viewing as someone, every change is refused on purpose:
  // explain that instead of showing (and reporting) a scary error.
  const viewing = useSyncExternalStore(noSubscribe, isViewingAs, () => false);
  useEffect(() => {
    console.error(error);
    if (!isViewingAs()) reportError(error, { digest: error.digest });
  }, [error]);

  if (viewing) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <Eye className="size-10 text-amber-400" aria-hidden />
        <h1 className="text-xl font-bold">Read-only while viewing as someone</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          You&apos;re seeing the app as another person, so changes are turned off. Nothing was changed
          on their account.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="outline" onClick={() => reset()}>
            Keep looking around
          </Button>
          <Button asChild>
            <a href="/owner/stop-viewing">Stop viewing</a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <TriangleAlert className="size-10 text-amber-400" aria-hidden />
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        An unexpected error occurred. Your data is safe. Try again, and if it keeps happening,
        contact support{error.digest ? ` (ref: ${error.digest})` : ""}.
      </p>
      <Button onClick={() => reset()}>Try again</Button>
    </div>
  );
}
