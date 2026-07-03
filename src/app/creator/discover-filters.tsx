"use client";

import { useRouter, usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Search } from "lucide-react";
import { useCallback, useRef } from "react";

export function DiscoverFilters({
  cities,
  activeCity,
  query,
  paidOnly,
}: {
  cities: string[];
  activeCity: string;
  query: string;
  paidOnly: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = useCallback(
    (patch: { q?: string; city?: string; paid?: string }) => {
      const params = new URLSearchParams(window.location.search);
      params.delete("welcome");
      for (const [key, value] of Object.entries(patch)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname],
  );

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-52 flex-1">
        <Label htmlFor="show-search" className="sr-only">
          Search shows
        </Label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="show-search"
            placeholder="Search artist, venue, or city…"
            className="pl-9"
            defaultValue={query}
            onChange={(event) => {
              if (debounce.current) clearTimeout(debounce.current);
              const value = event.target.value;
              debounce.current = setTimeout(() => update({ q: value || undefined }), 350);
            }}
          />
        </div>
      </div>
      <div className="w-44">
        <Label htmlFor="city-filter" className="mb-1.5 block text-xs text-muted-foreground">
          City
        </Label>
        <Select
          value={activeCity || "all"}
          onValueChange={(value) => update({ city: value === "all" ? "all" : value })}
        >
          <SelectTrigger id="city-filter" className="w-full">
            <SelectValue placeholder="All cities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All cities</SelectItem>
            {cities.map((city) => (
              <SelectItem key={city} value={city}>
                {city}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2 pb-2">
        <Switch
          id="paid-only"
          checked={paidOnly}
          onCheckedChange={(checked) => update({ paid: checked ? "1" : undefined })}
        />
        <Label htmlFor="paid-only" className="text-sm">
          Paid only
        </Label>
      </div>
    </div>
  );
}
