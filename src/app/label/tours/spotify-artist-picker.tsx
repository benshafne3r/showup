"use client";

import { useState, useRef, useEffect } from "react";
import { searchSpotifyArtistsAction, enrichArtistAction } from "../actions";
import { Input } from "@/components/ui/input";
import { Search, Loader2, Check } from "lucide-react";

export type PickedArtist = {
  name: string;
  genre: string;
  imageUrl: string | null;
  spotifyUrl: string;
  bio: string;
  instagram: string;
};

type SearchHit = Pick<PickedArtist, "name" | "genre" | "imageUrl" | "spotifyUrl">;

/**
 * Type-ahead over Spotify's artist catalog. On select it fills name/genre/photo
 * from Spotify and then enriches with a bio + Instagram from MusicBrainz +
 * Wikipedia (Spotify has neither). When Spotify isn't configured the search
 * returns [], so this quietly shows nothing and manual entry still works.
 */
export function SpotifyArtistPicker({
  onSelect,
  selectedName,
}: {
  onSelect: (artist: PickedArtist) => void;
  selectedName?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [enriching, setEnriching] = useState(false);
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
    setSearching(true);
    timer.current = setTimeout(async () => {
      const found = await searchSpotifyArtistsAction(value);
      setResults(
        found.map((a) => ({
          name: a.name,
          genre: a.genre,
          imageUrl: a.imageUrl,
          spotifyUrl: a.spotifyUrl,
        })),
      );
      setSearching(false);
      setOpen(true);
    }, 300);
  }

  async function choose(hit: SearchHit) {
    setQuery(hit.name);
    setOpen(false);
    setEnriching(true);
    // Fill Spotify data immediately; layer bio + Instagram on once fetched.
    onSelect({ ...hit, bio: "", instagram: "" });
    try {
      const extra = await enrichArtistAction(hit.name);
      onSelect({ ...hit, bio: extra.bio, instagram: extra.instagram });
    } finally {
      setEnriching(false);
    }
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
        {searching || enriching ? (
          <Loader2 className="absolute top-2.5 right-2.5 size-4 animate-spin text-muted-foreground" aria-hidden />
        ) : null}
      </div>

      {selectedName ? (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-emerald-400">
          <Check className="size-3.5" aria-hidden />
          {enriching ? `Fetching ${selectedName}'s details…` : `Using ${selectedName} from Spotify`}
        </p>
      ) : null}

      {open && results.length > 0 ? (
        <ul className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-popover p-1 shadow-lg">
          {results.map((artist, i) => (
            <li key={`${artist.spotifyUrl}-${i}`}>
              <button
                type="button"
                onClick={() => choose(artist)}
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
