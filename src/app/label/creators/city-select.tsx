"use client";

import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Pick one of the cities you have upcoming shows in (most creators first). */
export function CitySelect({
  cities,
  selected,
}: {
  cities: { key: string; label: string; inCity: number; nearby: number }[];
  selected: string;
}) {
  const router = useRouter();
  return (
    <div className="w-full max-w-sm space-y-1.5">
      <Label htmlFor="creator-city" className="text-xs text-muted-foreground">
        City
      </Label>
      <Select
        value={selected}
        onValueChange={(key) => router.push(`/label/creators?city=${encodeURIComponent(key)}`, { scroll: false })}
      >
        <SelectTrigger id="creator-city" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {cities.map((c) => (
            <SelectItem key={c.key} value={c.key}>
              {c.label}
              <span className="text-xs text-muted-foreground tabular-nums">
                {`· ${c.inCity} here${c.nearby ? ` · ${c.nearby} nearby` : ""}`}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
