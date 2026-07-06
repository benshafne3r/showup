"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { TriangleAlert } from "lucide-react";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <TriangleAlert className="size-10 text-amber-400" aria-hidden />
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        An unexpected error occurred. Your data is safe — try again, and if it keeps happening,
        contact support{error.digest ? ` (ref: ${error.digest})` : ""}.
      </p>
      <Button onClick={() => reset()}>Try again</Button>
    </div>
  );
}
