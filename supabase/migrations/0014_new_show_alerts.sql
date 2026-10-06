-- Creators can opt into an email when a label publishes a show in their city.
-- The scheduled job batches newly published opportunities (so a bulk import
-- sends one email per creator, not one per show) and stamps each opportunity
-- once it has been announced.

alter type public.notification_type add value if not exists 'new_show_nearby';

alter table public.creator_profiles
  add column new_show_alerts boolean not null default false;

alter table public.show_opportunities
  add column city_alerts_sent_at timestamptz;

-- Everything already published is old news — never announce it.
update public.show_opportunities
   set city_alerts_sent_at = now()
 where published_at is not null;

create index show_opportunities_alerts_due_idx
  on public.show_opportunities (published_at)
  where published_at is not null and city_alerts_sent_at is null;

create index creator_profiles_alerts_city_idx
  on public.creator_profiles (lower(trim(city)))
  where new_show_alerts;
