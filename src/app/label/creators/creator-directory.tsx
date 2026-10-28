"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { DirectoryCreator } from "@/server/services/offers";
import { creatorsInCityAction, inviteCreatorsAction } from "../actions";
import { CreatorCheckCard } from "./creator-check-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, Send, Users } from "lucide-react";

type ShowOption = { id: string; label: string; cityKey: string; city: string; ticketsLeft: number };

/**
 * The label's master list of creators: filter by city or search, tick as many
 * as you like (picks survive filter changes), then pick a show and invite them
 * all with one message. Picking a show offers "Select everyone in <its city>".
 */
export function CreatorDirectory({
  creators,
  total,
  cities,
  allCount,
  city,
  query,
  shows,
  moreHref,
}: {
  creators: DirectoryCreator[];
  total: number;
  cities: { key: string; label: string; creators: number }[];
  allCount: number;
  city: string;
  query: string;
  shows: ShowOption[];
  moreHref: string | null;
}) {
  const router = useRouter();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selected, setSelected] = useState<Map<string, string>>(new Map());
  const [showId, setShowId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  const [selectingCity, startSelectingCity] = useTransition();

  const show = shows.find((s) => s.id === showId) ?? null;
  const cityCount = show ? (cities.find((c) => c.key === show.cityKey)?.creators ?? 0) : 0;
  const tooMany = show ? selected.size > show.ticketsLeft : false;

  const filter = (patch: { city?: string; q?: string }) => {
    const params = new URLSearchParams();
    const nextCity = patch.city ?? city;
    const nextQ = patch.q ?? query;
    if (nextCity) params.set("city", nextCity);
    if (nextQ) params.set("q", nextQ);
    const qs = params.toString();
    router.replace(qs ? `/label/creators?${qs}` : "/label/creators", { scroll: false });
  };

  const toggle = (c: DirectoryCreator) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(c.id)) next.delete(c.id);
      else next.set(c.id, c.name);
      return next;
    });

  const selectAllShown = () =>
    setSelected((prev) => {
      const next = new Map(prev);
      for (const c of creators) if (!(showId && c.invitedTo.includes(showId))) next.set(c.id, c.name);
      return next;
    });

  const selectCity = () => {
    if (!show) return;
    startSelectingCity(async () => {
      const everyone = await creatorsInCityAction(show.cityKey, show.id);
      setSelected((prev) => {
        const next = new Map(prev);
        for (const c of everyone) next.set(c.id, c.name);
        return next;
      });
      filter({ city: show.cityKey, q: "" });
    });
  };

  // Switching shows unticks creators already invited to the new one.
  const pickShow = (id: string) => {
    setShowId(id);
    setSelected((prev) => {
      const next = new Map(prev);
      for (const c of creators) if (c.invitedTo.includes(id)) next.delete(c.id);
      return next;
    });
  };

  const send = () => {
    if (!show) return;
    setError(null);
    startSending(async () => {
      const result = await inviteCreatorsAction({ showId: show.id, creatorIds: [...selected.keys()], message });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(result.message);
      setSelected(new Map());
      setMessage("");
      router.refresh();
    });
  };

  return (
    <div className="space-y-4 pb-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full space-y-1.5 sm:w-64">
          <Label htmlFor="creator-city" className="text-xs text-muted-foreground">
            City
          </Label>
          <Select value={city || "all"} onValueChange={(key) => filter({ city: key === "all" ? "" : key })}>
            <SelectTrigger id="creator-city" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                All cities
                <span className="text-xs text-muted-foreground tabular-nums">{`· ${allCount}`}</span>
              </SelectItem>
              {cities.map((c) => (
                <SelectItem key={c.key} value={c.key}>
                  {c.label}
                  <span className="text-xs text-muted-foreground tabular-nums">{`· ${c.creators}`}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-52 flex-1 space-y-1.5">
          <Label htmlFor="creator-search" className="text-xs text-muted-foreground">
            Search
          </Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="creator-search"
              placeholder="Name, @handle, city or state"
              className="pl-9"
              defaultValue={query}
              onChange={(event) => {
                if (debounce.current) clearTimeout(debounce.current);
                const value = event.target.value.trim();
                debounce.current = setTimeout(() => filter({ q: value }), 350);
              }}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-muted-foreground tabular-nums">
          {total} creator{total === 1 ? "" : "s"}
          {city ? ` in ${cities.find((c) => c.key === city)?.label ?? city}` : ""}
          {query ? ` matching “${query}”` : ""}
        </p>
        {creators.length ? (
          <Button type="button" variant="ghost" size="sm" onClick={selectAllShown}>
            Select all shown
          </Button>
        ) : null}
      </div>

      {creators.length ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {creators.map((c) => {
            const invited = !!showId && c.invitedTo.includes(showId);
            return (
              <li key={c.id}>
                <CreatorCheckCard
                  creator={c}
                  checked={selected.has(c.id)}
                  onToggle={() => toggle(c)}
                  disabled={invited}
                  note={invited ? "Already invited to this show" : null}
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No creators match. Try another city or search.
        </p>
      )}
      {moreHref ? (
        <Button asChild variant="outline" size="sm">
          <Link href={moreHref} scroll={false}>
            Load more creators
          </Link>
        </Button>
      ) : null}

      {/* Invite bar: stays on screen while you scroll and pick. */}
      <section
        aria-label="Invite selected creators"
        className="sticky bottom-0 z-20 -mx-1 space-y-3 rounded-xl border bg-card/95 p-4 shadow-2xl backdrop-blur"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Users className="size-4 text-primary" aria-hidden />
            {selected.size} selected
            {selected.size ? (
              <button
                type="button"
                className="text-xs font-normal text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={() => setSelected(new Map())}
              >
                Clear
              </button>
            ) : null}
          </p>
          {show ? (
            <Button type="button" variant="outline" size="sm" onClick={selectCity} disabled={selectingCity || !cityCount}>
              {selectingCity ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Select everyone in {show.city}
            </Button>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] md:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="invite-show" className="text-xs text-muted-foreground">
              Invite them to
            </Label>
            {shows.length ? (
              <Select value={showId} onValueChange={pickShow}>
                <SelectTrigger id="invite-show" className="w-full">
                  <SelectValue placeholder="Choose a show" />
                </SelectTrigger>
                <SelectContent>
                  {shows.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                      <span className="text-xs text-muted-foreground tabular-nums">{`· ${s.ticketsLeft} left`}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">
                <Link href="/label/tours" className="underline underline-offset-2">
                  Publish a show
                </Link>{" "}
                to invite creators.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-message" className="text-xs text-muted-foreground">
              Message (optional)
            </Label>
            <Textarea
              id="invite-message"
              rows={1}
              maxLength={2000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Why you'd love them there"
              className="min-h-9"
            />
          </div>
          <Button type="button" onClick={send} disabled={!show || !selected.size || tooMany || sending}>
            {sending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
            {selected.size ? `Invite ${selected.size} creator${selected.size === 1 ? "" : "s"}` : "Invite creators"}
          </Button>
        </div>
        {tooMany && show ? (
          <p role="alert" className="text-xs font-medium text-amber-300">
            {`Only ${show.ticketsLeft} ticket${show.ticketsLeft === 1 ? "" : "s"} left for this show. Unselect some creators.`}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm font-medium text-red-400">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}
