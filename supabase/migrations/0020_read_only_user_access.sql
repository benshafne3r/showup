-- Users' own database access (the anon / authenticated roles behind the
-- public API key) becomes read-only. The app writes only through its server
-- (service role), so nothing legitimate used these grants, but they let a
-- signed-in user, through the API directly:
--   - edit their payout fields (stripe_account_id, stripe_payouts_enabled),
--     verified flags and follower counts on their creator profile, and
--   - insert chat messages that skipped the app's rate limit and set which
--     agency a message appears to come from.
-- RLS still decides which rows each user can read.

revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public from anon, authenticated;

-- Tables created by later migrations start read-only too.
alter default privileges in schema public
  revoke insert, update, delete, truncate, references, trigger on tables from anon, authenticated;

-- The write policies those grants backed are now dead; drop them so the
-- intent is plain.
drop policy if exists creator_profiles_insert on public.creator_profiles;
drop policy if exists creator_profiles_update on public.creator_profiles;
drop policy if exists creator_social_insert on public.creator_social_accounts;
drop policy if exists creator_social_update on public.creator_social_accounts;
drop policy if exists creator_social_delete on public.creator_social_accounts;
drop policy if exists messages_insert on public.messages;

-- Secret locations: through the API a user can read only a venue's city,
-- state and country. Names, addresses and pins come from the server, which
-- hides them until the creator is approved (services/venues.ts).
revoke select on public.venues from anon, authenticated;
grant select (id, city, state, country) on public.venues to authenticated;
