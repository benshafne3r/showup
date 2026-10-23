-- Filtering, pagination and totals in the database instead of in app code
-- over capped row lists. Pages ask for one page of ids (plus the true total)
-- and totals come from aggregates, so nothing silently stops at 60 / 100 /
-- 200 / 5000 rows.

-- ── Normalized, indexed city / state keys ─────────────────────────────────
-- Same rules as cityKey() in src/lib/cities.ts and stateKey()/showStateKey()
-- in src/lib/us-states.ts (an integration test keeps them in step).

create or replace function public.city_key(p text)
returns text language sql immutable parallel safe as $$
  select case b
    when 'la' then 'los angeles' when 'l.a.' then 'los angeles'
    when 'nyc' then 'new york' when 'new york city' then 'new york'
    when 'sf' then 'san francisco' when 'atl' then 'atlanta' when 'philly' then 'philadelphia'
    when 'dc' then 'washington' when 'washington dc' then 'washington' when 'washington d.c.' then 'washington'
    when 'nola' then 'new orleans' when 'vegas' then 'las vegas'
    else b end
  -- Like JS: trim every kind of whitespace (not just spaces), then collapse runs.
  from (select btrim(regexp_replace(lower(split_part(coalesce(p, ''), ',', 1)), '\s+', ' ', 'g')) as b) x
$$;

create or replace function public.state_key(p text)
returns text language sql immutable parallel safe as $$
  with states(abbr, name) as (values
    ('AL','Alabama'),('AK','Alaska'),('AZ','Arizona'),('AR','Arkansas'),('CA','California'),
    ('CO','Colorado'),('CT','Connecticut'),('DE','Delaware'),('DC','District of Columbia'),
    ('FL','Florida'),('GA','Georgia'),('HI','Hawaii'),('ID','Idaho'),('IL','Illinois'),
    ('IN','Indiana'),('IA','Iowa'),('KS','Kansas'),('KY','Kentucky'),('LA','Louisiana'),
    ('ME','Maine'),('MD','Maryland'),('MA','Massachusetts'),('MI','Michigan'),('MN','Minnesota'),
    ('MS','Mississippi'),('MO','Missouri'),('MT','Montana'),('NE','Nebraska'),('NV','Nevada'),
    ('NH','New Hampshire'),('NJ','New Jersey'),('NM','New Mexico'),('NY','New York'),
    ('NC','North Carolina'),('ND','North Dakota'),('OH','Ohio'),('OK','Oklahoma'),('OR','Oregon'),
    ('PA','Pennsylvania'),('RI','Rhode Island'),('SC','South Carolina'),('SD','South Dakota'),
    ('TN','Tennessee'),('TX','Texas'),('UT','Utah'),('VT','Vermont'),('VA','Virginia'),
    ('WA','Washington'),('WV','West Virginia'),('WI','Wisconsin'),('WY','Wyoming'))
  , v(t) as (select regexp_replace(coalesce(p, ''), '^\s+|\s+$', '', 'g'))
  select coalesce(
    (select lower(name) from states, v where abbr = upper(v.t)),
    (select lower(name) from states, v where lower(name) = lower(v.t)),
    '')
$$;

-- States of the major markets, for venues saved without one.
create or replace function public.city_state_key(p_city_key text)
returns text language sql immutable parallel safe as $$
  select public.state_key(case p_city_key
    when 'atlanta' then 'GA' when 'austin' then 'TX' when 'boston' then 'MA' when 'charlotte' then 'NC'
    when 'chicago' then 'IL' when 'dallas' then 'TX' when 'denver' then 'CO' when 'detroit' then 'MI'
    when 'houston' then 'TX' when 'las vegas' then 'NV' when 'los angeles' then 'CA' when 'miami' then 'FL'
    when 'minneapolis' then 'MN' when 'nashville' then 'TN' when 'new orleans' then 'LA' when 'new york' then 'NY'
    when 'newark' then 'NJ' when 'philadelphia' then 'PA' when 'phoenix' then 'AZ' when 'portland' then 'OR'
    when 'san diego' then 'CA' when 'san francisco' then 'CA' when 'seattle' then 'WA' when 'washington' then 'DC'
    when 'brooklyn' then 'NY' when 'oakland' then 'CA' when 'san jose' then 'CA' when 'sacramento' then 'CA'
    when 'inglewood' then 'CA' when 'anaheim' then 'CA' when 'salt lake city' then 'UT' when 'saint paul' then 'MN'
    when 'st. paul' then 'MN' when 'morrison' then 'CO' when 'orlando' then 'FL' when 'tampa' then 'FL'
    when 'college station' then 'TX' when 'san antonio' then 'TX' when 'fort worth' then 'TX'
    when 'columbus' then 'OH' when 'cleveland' then 'OH' when 'pittsburgh' then 'PA' when 'baltimore' then 'MD'
    when 'louisville' then 'KY' when 'indianapolis' then 'IN' when 'milwaukee' then 'WI'
    when 'kansas city' then 'MO' when 'st. louis' then 'MO' when 'raleigh' then 'NC'
    else '' end)
$$;

alter table public.venues
  add column city_key text generated always as (public.city_key(city)) stored,
  add column state_key text generated always as (
    coalesce(nullif(public.state_key(state), ''), public.city_state_key(public.city_key(city)))
  ) stored;
alter table public.creator_profiles
  add column city_key text generated always as (public.city_key(city)) stored,
  add column region_key text generated always as (public.state_key(region)) stored;

create index venues_city_key_idx on public.venues (city_key);
create index creator_profiles_city_key_idx on public.creator_profiles (city_key, audience_size desc)
  where onboarded_at is not null;
create index creator_profiles_region_key_idx on public.creator_profiles (region_key, audience_size desc)
  where onboarded_at is not null;

-- ── Discover: filter first, then paginate ─────────────────────────────────
create or replace function public.like_pattern(p text)
returns text language sql immutable as $$
  select '%' || replace(replace(replace(coalesce(p, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%'
$$;

-- Open shows (published, upcoming, still taking requests), optionally in one
-- city and matching a search; secret venue names are never searchable.
create or replace function public.discover_shows(p_city_key text, p_query text, p_limit int, p_offset int)
returns table (show_id uuid, total bigint)
language sql stable security definer set search_path = public as $$
  with matches as (
    select s.id, s.date
      from public.shows s
      join public.show_opportunities o on o.show_id = s.id
      join public.artists a on a.id = s.artist_id
      join public.venues v on v.id = s.venue_id
     where s.status in ('published', 'postponed')
       and s.date >= (now() at time zone 'UTC')::date
       and o.published_at is not null and o.application_deadline > now()
       and (coalesce(p_city_key, '') = '' or v.city_key = p_city_key)
       and (coalesce(p_query, '') = ''
            or a.name ilike public.like_pattern(p_query)
            or v.city ilike public.like_pattern(p_query)
            or (not s.hide_venue_until_approved and v.name ilike public.like_pattern(p_query)))
  )
  select id, count(*) over () from matches order by date, id limit p_limit offset p_offset
$$;

-- Distinct cities with open shows (for the Discover city filter).
create or replace function public.open_show_cities()
returns table (city text)
language sql stable security definer set search_path = public as $$
  select distinct on (v.city_key) v.city
    from public.shows s
    join public.show_opportunities o on o.show_id = s.id
    join public.venues v on v.id = s.venue_id
   where s.status in ('published', 'postponed')
     and s.date >= (now() at time zone 'UTC')::date
     and o.published_at is not null and o.application_deadline > now()
   order by v.city_key, v.city
$$;

-- ── Creators near a show (label picks / Creators tab) ─────────────────────
-- bucket 'city': same city; 'nearby': same state, different (or no) city.
create or replace function public.creators_near(
  p_city_key text, p_state_key text, p_bucket text, p_limit int, p_offset int
) returns table (user_id uuid, total bigint)
language sql stable security definer set search_path = public as $$
  select p.user_id, count(*) over ()
    from public.creator_profiles p
    join public.users u on u.id = p.user_id and u.status = 'active' and u.role = 'creator'
   where p.onboarded_at is not null
     and case when p_bucket = 'city'
              then coalesce(p_city_key, '') <> '' and p.city_key = p_city_key
              else coalesce(p_state_key, '') <> '' and p.region_key = p_state_key
                   and p.city_key is distinct from p_city_key
         end
   order by p.audience_size desc, p.user_id
   limit p_limit offset p_offset
$$;

create or replace function public.creator_counts_near(p_city_keys text[], p_state_keys text[])
returns table (idx int, in_city bigint, nearby bigint)
language sql stable security definer set search_path = public as $$
  select t.idx::int,
    (select count(*) from public.creator_profiles p
       join public.users u on u.id = p.user_id and u.status = 'active' and u.role = 'creator'
      where p.onboarded_at is not null and coalesce(t.ck, '') <> '' and p.city_key = t.ck),
    (select count(*) from public.creator_profiles p
       join public.users u on u.id = p.user_id and u.status = 'active' and u.role = 'creator'
      where p.onboarded_at is not null and coalesce(t.sk, '') <> '' and p.region_key = t.sk
        and p.city_key is distinct from t.ck)
  from unnest(p_city_keys, p_state_keys) with ordinality as t(ck, sk, idx)
$$;

-- ── Messaging: thread list and unread count without loading history ──────
create or replace function public.thread_summaries(
  p_viewer uuid, p_creator_id uuid, p_company_id uuid, p_agency_id uuid, p_limit int, p_offset int
) returns table (
  id uuid, subject text, creator_id uuid, company_id uuid, last_message_at timestamptz,
  last_body text, last_kind text, unread boolean, total bigint
)
language sql stable security definer set search_path = public as $$
  with t as (
    select mt.* from public.message_threads mt
     where (p_creator_id is null or mt.creator_id = p_creator_id)
       and (p_company_id is null or mt.company_id = p_company_id)
       and (p_agency_id is null or mt.creator_id in (select ac.creator_id from public.agency_creators ac where ac.agency_id = p_agency_id))
  ), page as (
    select t.*, count(*) over () as total from t
     order by t.last_message_at desc nulls last, t.id
     limit p_limit offset p_offset
  )
  select page.id, page.subject, page.creator_id, page.company_id, page.last_message_at,
         lm.body, lm.kind::text,
         exists (select 1 from public.messages m
                  where m.thread_id = page.id and m.sender_id is distinct from p_viewer
                    and not (m.read_by @> array[p_viewer])),
         page.total
    from page
    left join lateral (
      select m.body, m.kind from public.messages m where m.thread_id = page.id order by m.created_at desc limit 1
    ) lm on true
   order by page.last_message_at desc nulls last, page.id
$$;

-- Unread messages across every thread this user takes part in (their own,
-- their companies', their agency roster's), counted in SQL.
create or replace function public.unread_message_count(p_user uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select count(*)
    from public.messages m
    join public.message_threads t on t.id = m.thread_id
   where m.sender_id <> p_user
     and not (m.read_by @> array[p_user])
     and (
       (t.creator_id = p_user and not exists (select 1 from public.agency_creators ac where ac.creator_id = p_user))
       or t.company_id in (select cm.company_id from public.company_members cm where cm.user_id = p_user)
       or t.creator_id in (select ac.creator_id from public.agency_creators ac
                             join public.agency_members am on am.agency_id = ac.agency_id
                            where am.user_id = p_user)
     )
$$;

-- ── Money and dashboard totals ────────────────────────────────────────────
create or replace function public.company_payment_totals(p_company_id uuid)
returns table (paid_cents bigint, committed_cents bigint, attended bigint, completed bigint, no_shows bigint, confirmed bigint)
language sql stable security definer set search_path = public as $$
  select
    (select coalesce(sum(amount_cents), 0) from public.creator_payment_records where company_id = p_company_id and status = 'paid'),
    (select coalesce(sum(amount_cents), 0) from public.creator_payment_records where company_id = p_company_id and status in ('pending_fulfillment', 'ready')),
    (select count(*) from public.bookings where company_id = p_company_id and status in ('attended', 'completed')),
    (select count(*) from public.bookings where company_id = p_company_id and status = 'completed'),
    (select count(*) from public.bookings where company_id = p_company_id and status = 'no_show_review'),
    (select count(*) from public.bookings where company_id = p_company_id and status in ('confirmed', 'attended', 'completed', 'no_show_review', 'disputed'))
$$;

create or replace function public.agency_paid_cents(p_agency_id uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount_cents), 0) from public.creator_payment_records
   where payee_agency_id = p_agency_id and status = 'paid'
$$;

create or replace function public.creator_paid_cents(p_creator_id uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount_cents), 0) from public.creator_payment_records
   where creator_id = p_creator_id and status = 'paid'
$$;

-- Owner dashboard tiles, all as aggregates (roster profiles aren't sign-ups).
create or replace function public.owner_stats()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'accounts', (select count(*) from public.users where not managed_profile),
    'new_this_week', (select count(*) from public.users where not managed_profile and created_at >= now() - interval '7 days'),
    'creators', (select count(*) from public.users where not managed_profile and role = 'creator'),
    'onboarded_creators', (select count(*) from public.users u join public.creator_profiles p on p.user_id = u.id
                            where not u.managed_profile and u.role = 'creator' and p.onboarded_at is not null),
    'alerts_on', (select count(*) from public.users u join public.creator_profiles p on p.user_id = u.id
                   where not u.managed_profile and u.role = 'creator' and p.new_show_alerts),
    'roster_profiles', (select count(*) from public.users where managed_profile),
    'creators_with_card', (select count(distinct pm.user_id) from public.payment_methods pm
                            join public.users u on u.id = pm.user_id
                           where u.role = 'creator' and not u.managed_profile and pm.agency_id is null),
    'labels', (select count(*) from public.users where role = 'label'),
    'managers', (select count(*) from public.users where role = 'manager'),
    'agencies', (select count(distinct agency_id) from public.agency_members),
    'open_shows', (select count(*) from public.shows s join public.show_opportunities o on o.show_id = s.id
                    where s.status = 'published' and s.date >= (now() at time zone 'UTC')::date
                      and o.published_at is not null and o.application_deadline > now()),
    'pending_requests', (select count(*) from public.show_requests where status = 'pending'),
    'active_bookings', (select count(*) from public.bookings where status in
                         ('awaiting_acceptance', 'awaiting_payment_method', 'confirmed', 'authorization_failed', 'attended', 'no_show_review', 'disputed')),
    'holds_count', (select count(*) from public.authorization_records where status = 'authorized'),
    'holds_cents', (select coalesce(sum(amount_cents), 0) from public.authorization_records where status = 'authorized'),
    'captured_count', (select count(*) from public.authorization_records where status = 'captured'),
    'captured_cents', (select coalesce(sum(coalesce(capture_amount_cents, amount_cents)), 0) from public.authorization_records where status = 'captured'),
    'paid_cents', (select coalesce(sum(amount_cents), 0) from public.creator_payment_records where status = 'paid'),
    'bookings_by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
                             from (select status, count(*) as n from public.bookings group by status) b)
  )
$$;

-- Roster page by audience, with the true total.
create or replace function public.roster_page(p_agency_id uuid, p_limit int, p_offset int)
returns table (creator_id uuid, total bigint)
language sql stable security definer set search_path = public as $$
  select ac.creator_id, count(*) over ()
    from public.agency_creators ac
    left join public.creator_profiles p on p.user_id = ac.creator_id
   where ac.agency_id = p_agency_id
   order by coalesce(p.audience_size, 0) desc, ac.creator_id
   limit p_limit offset p_offset
$$;

-- ── Agency-scoped lists: join the roster in SQL instead of sending every
-- roster id in the request URL (which breaks past a few hundred creators).
create or replace function public.agency_request_page(p_agency_id uuid, p_open boolean, p_limit int, p_offset int)
returns table (request_id uuid, total bigint)
language sql stable security definer set search_path = public as $$
  select r.id, count(*) over ()
    from public.show_requests r
    join public.agency_creators ac on ac.creator_id = r.creator_id
   where ac.agency_id = p_agency_id
     and (r.status in ('pending', 'waitlisted')) = p_open
   order by r.created_at desc, r.id
   limit p_limit offset p_offset
$$;

create or replace function public.agency_badges(p_agency_id uuid)
returns table (pending_requests bigint, waiting_on_you bigint)
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from public.show_requests r join public.agency_creators ac on ac.creator_id = r.creator_id
      where ac.agency_id = p_agency_id and r.status = 'pending'),
    (select count(*) from public.bookings b join public.agency_creators ac on ac.creator_id = b.creator_id
      where ac.agency_id = p_agency_id and b.status in ('awaiting_acceptance', 'awaiting_payment_method')
        and b.acceptance_deadline_at > now())
$$;

create or replace function public.agency_waiting_bookings(p_agency_id uuid, p_limit int, p_offset int)
returns table (booking_id uuid, total bigint)
language sql stable security definer set search_path = public as $$
  select b.id, count(*) over ()
    from public.bookings b
    join public.agency_creators ac on ac.creator_id = b.creator_id
   where ac.agency_id = p_agency_id
     and b.status in ('awaiting_acceptance', 'awaiting_payment_method')
     and b.acceptance_deadline_at > now()
   order by b.acceptance_deadline_at, b.id
   limit p_limit offset p_offset
$$;

create or replace function public.agency_payment_page(p_agency_id uuid, p_limit int, p_offset int)
returns table (record_id uuid, total bigint)
language sql stable security definer set search_path = public as $$
  select p.id, count(*) over ()
    from public.creator_payment_records p
   where (p.payee_agency_id = p_agency_id
          or p.creator_id in (select ac.creator_id from public.agency_creators ac where ac.agency_id = p_agency_id))
     and p.status not in ('not_required', 'canceled')
   order by p.created_at desc, p.id
   limit p_limit offset p_offset
$$;

-- Sort orders the paginated lists use.
create index if not exists message_threads_company_recent_idx on public.message_threads (company_id, last_message_at desc nulls last);
create index if not exists message_threads_creator_recent_idx on public.message_threads (creator_id, last_message_at desc nulls last);
create index if not exists show_requests_company_recent_idx on public.show_requests (company_id, created_at desc);
create index if not exists show_requests_creator_recent_idx on public.show_requests (creator_id, created_at desc);
create index if not exists bookings_company_recent_idx on public.bookings (company_id, created_at desc);
create index if not exists bookings_creator_recent_idx on public.bookings (creator_id, created_at desc);
create index if not exists creator_payment_records_company_recent_idx on public.creator_payment_records (company_id, created_at desc);
create index if not exists authorization_records_company_recent_idx on public.authorization_records (company_id, created_at desc);
create index if not exists users_created_at_idx on public.users (created_at desc);

do $$
declare f text;
begin
  foreach f in array array[
    'discover_shows(text, text, int, int)', 'open_show_cities()', 'creators_near(text, text, text, int, int)',
    'creator_counts_near(text[], text[])', 'thread_summaries(uuid, uuid, uuid, uuid, int, int)',
    'unread_message_count(uuid)', 'company_payment_totals(uuid)', 'agency_paid_cents(uuid)', 'creator_paid_cents(uuid)',
    'owner_stats()', 'roster_page(uuid, int, int)', 'agency_request_page(uuid, boolean, int, int)',
    'agency_badges(uuid)', 'agency_payment_page(uuid, int, int)', 'agency_waiting_bookings(uuid, int, int)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
