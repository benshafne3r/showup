"use client";

import { useState } from "react";
import { suggestCitiesAction, suggestVenuesAction } from "../actions";
import type { CitySuggestion, VenueSuggestion } from "@/lib/places";
import { SuggestInput } from "@/components/suggest-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Location = { venueName?: string; venueCity?: string; venueState?: string; venueAddress?: string };

const venueKey = (v: VenueSuggestion) => `${v.name}|${v.city}|${v.address}`;
const cityKey = (c: CitySuggestion) => `${c.city}|${c.state}`;

function VenueOption({ venue }: { venue: VenueSuggestion }) {
  return (
    <>
      <span className="block truncate font-medium">{venue.name}</span>
      <span className="block truncate text-xs text-muted-foreground">
        {[venue.city + (venue.state ? `, ${venue.state}` : ""), venue.address].filter(Boolean).join(" · ")}
      </span>
    </>
  );
}

/**
 * Venue, city, state and address with type-ahead. Picking a venue fills its
 * city, state and address; picking a city fills the state. Everything stays
 * editable. `compact` (pop-up form) shows only venue + city and carries the
 * picked state and address as hidden fields.
 */
export function VenueFields({ idPrefix, initial = {}, compact = false }: { idPrefix: string; initial?: Location; compact?: boolean }) {
  const [name, setName] = useState(initial.venueName ?? "");
  const [city, setCity] = useState(initial.venueCity ?? "");
  const [state, setState] = useState(initial.venueState ?? "");
  const [address, setAddress] = useState(initial.venueAddress ?? "");

  const pickVenue = (v: VenueSuggestion) => {
    setName(v.name);
    setCity(v.city);
    setState(v.state);
    setAddress(v.address);
  };
  const pickCity = (c: CitySuggestion) => {
    setCity(c.city);
    setState(c.state);
  };

  const venueInput = (
    <SuggestInput
      id={`${idPrefix}-venue`}
      name="venueName"
      value={name}
      onValueChange={(v) => {
        setName(v);
        if (compact) setAddress(""); // a hidden address belongs to the picked venue only
      }}
      suggest={suggestVenuesAction}
      itemKey={venueKey}
      renderItem={(v) => <VenueOption venue={v} />}
      onPick={pickVenue}
      placeholder={compact ? "The Echoplex, or 1155 Sunset Blvd" : "The Echoplex"}
      required
    />
  );
  const cityInput = (
    <SuggestInput
      id={`${idPrefix}-city`}
      name="venueCity"
      value={city}
      onValueChange={(v) => {
        setCity(v);
        if (compact) setState("");
      }}
      suggest={suggestCitiesAction}
      itemKey={cityKey}
      renderItem={(c) => `${c.city}, ${c.state}`}
      onPick={pickCity}
      placeholder="Los Angeles"
      required
    />
  );

  if (compact) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-venue`}>Venue / Address</Label>
          {venueInput}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-city`}>City</Label>
          {cityInput}
        </div>
        <input type="hidden" name="venueState" value={state} />
        <input type="hidden" name="venueAddress" value={address} />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-venue`}>Venue name</Label>
        {venueInput}
      </div>
      <div className="grid grid-cols-[1fr_90px] gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-city`}>City</Label>
          {cityInput}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-state`}>State</Label>
          <Input id={`${idPrefix}-state`} name="venueState" value={state} onChange={(e) => setState(e.target.value)} placeholder="CA" />
        </div>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-address`}>Address (optional)</Label>
        <Input
          id={`${idPrefix}-address`}
          name="venueAddress"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="1154 Glendale Blvd"
        />
      </div>
    </>
  );
}
