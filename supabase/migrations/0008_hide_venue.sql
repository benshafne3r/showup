-- Per-show "secret location": creators see only the city until they're
-- approved for the show. Used by one-off Events (pop-ups) at a secret address.
alter table public.shows
  add column if not exists hide_venue_until_approved boolean not null default false;
