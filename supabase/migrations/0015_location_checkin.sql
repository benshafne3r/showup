-- Location check-in: a creator taps "I'm here" on show day and, if their
-- phone's location is at the venue, attendance is verified automatically
-- (hold released, no label review). Photo check-in stays as the fallback.

-- Venue coordinates, filled by the geocoding job (or an import that has them).
alter table public.venues
  add column latitude double precision,
  add column longitude double precision,
  add column geocoded_at timestamptz, -- last attempt, success or not
  add column geocode_source text;

create index venues_geocode_due_idx on public.venues (geocoded_at nulls first)
  where latitude is null;

-- How each check-in was verified. Creator coordinates are stored rounded
-- (~11 m) and only for location check-ins.
alter table public.attendance_submissions
  add column method text not null default 'photo'
    check (method in ('photo', 'location')),
  add column latitude double precision,
  add column longitude double precision,
  add column accuracy_m integer,
  add column distance_m integer;
