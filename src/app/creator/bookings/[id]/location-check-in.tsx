"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { checkInWithLocationAction } from "../../actions";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin } from "lucide-react";

type State =
  | { kind: "idle" }
  | { kind: "locating" }
  | { kind: "checking" }
  | { kind: "done"; message: string }
  | { kind: "error"; message: string };

/**
 * "I'm here": reads the phone's location in the browser and lets the server
 * compare it with the venue. On a match, attendance is approved instantly.
 */
export function LocationCheckIn({ bookingId }: { bookingId: string }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const router = useRouter();
  const busy = state.kind === "locating" || state.kind === "checking";

  const checkIn = () => {
    if (!("geolocation" in navigator)) {
      setState({ kind: "error", message: "This browser can't share your location. Check in with a photo below." });
      return;
    }
    setState({ kind: "locating" });
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        setState({ kind: "checking" });
        const result = await checkInWithLocationAction({
          bookingId,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        if (result.ok) {
          setState({ kind: "done", message: result.message });
          router.refresh();
        } else {
          setState({ kind: "error", message: result.error });
        }
      },
      (error) => {
        setState({
          kind: "error",
          message:
            error.code === error.PERMISSION_DENIED
              ? "Location is blocked for this site. Allow location access in your browser settings and try again, or check in with a photo below."
              : "We couldn't get your location. Try again in a moment (near an entrance or window helps), or check in with a photo below.",
        });
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  };

  return (
    <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div>
        <p className="font-medium">At the venue?</p>
        <p className="text-xs text-muted-foreground">
          Tap below and we&apos;ll confirm you&apos;re there using your phone&apos;s location. Your hold is
          released right away, no photo needed.
        </p>
      </div>
      <Button type="button" size="lg" className="w-full" onClick={checkIn} disabled={busy || state.kind === "done"}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <MapPin className="size-4" aria-hidden />}
        {state.kind === "locating" ? "Finding you…" : state.kind === "checking" ? "Checking you in…" : "I'm here"}
      </Button>
      {state.kind === "error" ? (
        <p role="alert" className="text-sm font-medium text-red-400">
          {state.message}
        </p>
      ) : state.kind === "done" ? (
        <p role="status" className="text-sm font-medium text-emerald-400">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
