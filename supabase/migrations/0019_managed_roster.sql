-- Agency-run rosters: an agency can hold "managed profiles" (creators with no
-- login of their own), put ticket holds on the agency's card, and receive
-- label invites ("offers") for its creators. Labels never deal with those
-- creators directly; everything routes through the agency.

-- A managed profile is a creator account nobody signs in to. The agency acts
-- for it, and it is never emailed (the agency gets every notification).
alter table public.users
  add column managed_profile boolean not null default false;

-- State / region, for "nearby" matching when a creator only lists a state.
alter table public.creator_profiles
  add column region text not null default '';

-- A card saved for an agency (added by one of its managers) that covers
-- ticket holds for the agency's creators.
alter table public.payment_methods
  add column agency_id uuid references public.agencies(id) on delete cascade;
create index payment_methods_agency_idx
  on public.payment_methods (agency_id)
  where agency_id is not null;

-- Set when the agency accepts a booking for its creator: the hold goes on
-- that agency's card instead of the creator's.
alter table public.bookings
  add column hold_agency_id uuid references public.agencies(id) on delete set null;

-- Set when the label invited the creator (picked them on the show page)
-- instead of the creator or agency asking.
alter table public.show_requests
  add column offered_at timestamptz;

alter type public.notification_type add value if not exists 'offer_received';
