-- Functions nothing calls any more (found in the 2026-10-28 cleanup):
--   shares_company_with: an early RLS helper no policy uses.
--   release_tickets: superseded by cancel_booking_tx (0023).
--   creator_counts_near: the Creators tab now counts cities with creator_cities (0027).
-- No CASCADE: if anything did depend on one, this fails instead of dropping it.
drop function public.shares_company_with(uuid);
drop function public.release_tickets(uuid, integer);
drop function public.creator_counts_near(text[], text[]);
