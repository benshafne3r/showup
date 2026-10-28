"use client";

import { useMemo, useRef, useState, useTransition } from "react";
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
import { cn } from "@/lib/utils";
import { Loader2, Search, Send, Users, X } from "lucide-react";

type ShowOption = { id: string; label: string; cityKey: string; city: string; ticketsLeft: number };

const PAGE = 60;

/**
 * The label's master list of creators: filter by city or search, tick as many
 * as you like (picks survive filter changes), then invite them all to a show
 * with one message from a floating panel. When the whole list fits in the
 * page (`complete`), filtering happens right here with no server round trip;
 * past that size the filters go through the URL to the server.
 */
export function CreatorDirectory({
  creators,
  total,
  complete,
  cities,
  allCount,
  city: initialCity,
  query: initialQuery,
  shows,
  moreHref,
}: {
  creators: DirectoryCreator[];
  total: number;
  complete: boolean;
  cities: { key: string; label: string; creators: number }[];
  allCount: number;
  city: string;
  query: string;
  shows: ShowOption[];
  moreHref: string | null;
}) {
  const router = useRouter();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [city, setCity] = useState(initialCity);
  const [query, setQuery] = useState(initialQuery);
  const [shown, setShown] = useState(PAGE);
  const [selected, setSelected] = useState<Map<string, string>>(new Map());
  const [showId, setShowId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  const [selectingCity, startSelectingCity] = useTransition();
  const [filtering, startFiltering] = useTransition();

  // In the browser when everything is loaded; otherwise the server already filtered.
  const matches = useMemo(() => {
    if (!complete) return creators;
    const q = query.trim().toLowerCase().replace(/^@/, "");
    return creators.filter((c) => (!city || c.cityKey === city) && (!q || c.searchText.includes(q)));
  }, [complete, creators, city, query]);
  const visible = complete ? matches.slice(0, shown) : matches;
  const matchCount = complete ? matches.length : total;

  const show = shows.find((s) => s.id === showId) ?? null;
  const tooMany = show ? selected.size > show.ticketsLeft : false;
  const invitedToShow = (c: DirectoryCreator) => !!showId && c.invitedTo.includes(showId);

  const applyFilter = (patch: { city?: string; q?: string }) => {
    const nextCity = patch.city ?? city;
    const nextQ = patch.q ?? query;
    setCity(nextCity);
    setQuery(nextQ);
    setShown(PAGE);
    const params = new URLSearchParams();
    if (nextCity) params.set("city", nextCity);
    if (nextQ.trim()) params.set("q", nextQ.trim());
    const url = params.toString() ? `/label/creators?${params.toString()}` : "/label/creators";
    // Keep the URL shareable either way; only go to the server when it has to filter.
    if (complete) window.history.replaceState(null, "", url);
    else startFiltering(() => router.replace(url, { scroll: false }));
  };

  const toggle = (c: DirectoryCreator) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(c.id)) next.delete(c.id);
      else next.set(c.id, c.name);
      return next;
    });

  const selectAllMatching = () =>
    setSelected((prev) => {
      const next = new Map(prev);
      for (const c of matches) if (!invitedToShow(c)) next.set(c.id, c.name);
      return next;
    });

  // Switching shows unticks creators already invited to the new one.
  const pickShow = (id: string) => {
    setShowId(id);
    setSelected((prev) => {
      const next = new Map(prev);
      for (const c of creators) if (c.invitedTo.includes(id)) next.delete(c.id);
      return next;
    });
  };

  const selectCity = () => {
    if (!show) return;
    if (complete) {
      setSelected((prev) => {
        const next = new Map(prev);
        for (const c of creators) {
          if (c.cityKey === show.cityKey && !c.invitedTo.includes(show.id)) next.set(c.id, c.name);
        }
        return next;
      });
      applyFilter({ city: show.cityKey, q: "" });
      return;
    }
    startSelectingCity(async () => {
      const everyone = await creatorsInCityAction(show.cityKey, show.id);
      setSelected((prev) => {
        const next = new Map(prev);
        for (const c of everyone) next.set(c.id, c.name);
        return next;
      });
      applyFilter({ city: show.cityKey, q: "" });
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

  const cityLabel = cities.find((c) => c.key === city)?.label ?? city;

  return (
    <div className={cn("space-y-4", selected.size ? "pb-56 sm:pb-40" : "pb-4")}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full space-y-1.5 sm:w-64">
          <Label htmlFor="creator-city" className="text-xs text-muted-foreground">
            City
          </Label>
          <Select value={city || "all"} onValueChange={(key) => applyFilter({ city: key === "all" ? "" : key })}>
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
              defaultValue={initialQuery}
              onChange={(event) => {
                const value = event.target.value;
                if (complete) {
                  applyFilter({ q: value });
                  return;
                }
                if (debounce.current) clearTimeout(debounce.current);
                debounce.current = setTimeout(() => applyFilter({ q: value }), 350);
              }}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="flex items-center gap-2 text-muted-foreground tabular-nums">
          {matchCount} creator{matchCount === 1 ? "" : "s"}
          {city ? ` in ${cityLabel}` : ""}
          {query.trim() ? ` matching “${query.trim()}”` : ""}
          {filtering ? <Loader2 className="size-3.5 animate-spin" aria-label="Updating" /> : null}
        </p>
        {visible.length ? (
          <Button type="button" variant="ghost" size="sm" onClick={selectAllMatching}>
            {complete ? `Select all ${matches.length}` : "Select all shown"}
          </Button>
        ) : null}
      </div>

      {visible.length ? (
        <ul
          className={cn(
            "grid grid-cols-2 gap-2 transition-opacity sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
            filtering && "opacity-60",
          )}
        >
          {visible.map((c) => {
            const invited = invitedToShow(c);
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
      {complete ? (
        matches.length > shown ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setShown((n) => n + PAGE)}>
            Show more creators
          </Button>
        ) : null
      ) : moreHref ? (
        <Button asChild variant="outline" size="sm">
          <Link href={moreHref} scroll={false}>
            Load more creators
          </Link>
        </Button>
      ) : null}

      {/* Floating invite panel: appears once someone is selected. */}
      {selected.size ? (
        <section
          aria-label="Invite selected creators"
          className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-4xl space-y-3 rounded-2xl border bg-card/95 p-4 shadow-2xl ring-1 ring-black/40 backdrop-blur motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 sm:bottom-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Users className="size-4 text-primary" aria-hidden />
              {selected.size} selected
            </p>
            <div className="flex items-center gap-1">
              {show ? (
                <Button type="button" variant="outline" size="sm" onClick={selectCity} disabled={selectingCity}>
                  {selectingCity ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  Select everyone in {show.city}
                </Button>
              ) : null}
              <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Map())}>
                <X className="size-4" aria-hidden /> Clear
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] md:items-end">
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
            <Button type="button" onClick={send} disabled={!show || tooMany || sending}>
              {sending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
              {`Invite ${selected.size} creator${selected.size === 1 ? "" : "s"}`}
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
      ) : null}
    </div>
  );
}
