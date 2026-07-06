"use client";

import { useState, useRef, useTransition, useEffect } from "react";
import { searchSpotifyArtistsAction } from "../actions";
import { Input } from "@/components/ui/input";
import { Search, Loader2, Check } from "lucide-react";

export type PickedArtist = {
  name: string;
  genre: string;
  imageUrl: string | null;
  spotifyUrl: string;
};

/**
 * Type-ahead over Spotify's artist catalog. On select, hands the chosen
 * artist's name/genre/photo/url to the parent form. When Spotify isn't
 * configured the action returns [], so this quietly shows nothing and the
 * manual fields below remain the way to add an artist.
 */
export function SpotifyArtistPicker({
  onSelect,
  selectedName,
}: {
  onSelect: (artist: PickedArtist) => void;
  selectedName?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickedArtist[]>([]);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function onChange(value: string) {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    if (value.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(() => {
      start(async () => {
        const found = await searchSpotifyArtistsAction(value);
        setResults(
          found.map((a) => ({
            name: a.name,
            genre: a.genre,
            imageUrl: a.imageUrl,
            spotifyUrl: a.spotifyUrl,
          })),
        );
        setOpen(true);
      });
    }, 300);
  }

  return (
    <div className="relative" ref={boxRef}>
      <div className="relative">
        <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden />
        <Input
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          placeholder="Search Spotify for an artist…"
          className="pl-8"
          aria-label="Search Spotify for an artist"
          autoComplete="off"
        />
        {pending ? (
          <Loader2 className="absolute top-2.5 right-2.5 size-4 animate-spin text-muted-foreground" aria-hidden />
        ) : null}
      </div>

      {selectedName ? (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-emerald-400">
          <Check className="size-3.5" aria-hidden /> Using {selectedName} from Spotify
        </p>
      ) : null}

      {open && results.length > 0 ? (
        <ul className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-popover p-1 shadow-lg">
          {results.map((artist, i) => (
            <li key={`${artist.spotifyUrl}-${i}`}>
              <button
                type="button"
                onClick={() => {
                  onSelect(artist);
                  setQuery(artist.name);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-muted"
              >
                {artist.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={artist.imageUrl}
                    alt=""
                    className="size-9 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="size-9 shrink-0 rounded-full bg-muted" />
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{artist.name}</span>
                  {artist.genre ? (
                    <span className="block truncate text-xs text-muted-foreground capitalize">
                      {artist.genre}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
