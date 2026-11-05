-- "Today" for show dates is the date in Hawaii (UTC-10, no daylight saving),
-- the last US time zone to reach midnight; same rule as showToday() in
-- src/lib/dates.ts. UTC turned the day over at 4-5 pm Pacific, which hid
-- tonight's shows from Discover and sent "your show is tomorrow" two days out.
create or replace function public.show_today() returns date
language sql stable set search_path = public as $$
  select (now() at time zone 'Pacific/Honolulu')::date
$$;

CREATE OR REPLACE FUNCTION public.discover_shows(p_city_key text, p_query text, p_limit integer, p_offset integer)
 RETURNS TABLE(show_id uuid, total bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with matches as (
    select s.id, s.date
      from public.shows s
      join public.show_opportunities o on o.show_id = s.id
      join public.artists a on a.id = s.artist_id
      join public.venues v on v.id = s.venue_id
     where s.status in ('published', 'postponed')
       and s.date >= public.show_today()
       and o.published_at is not null and o.application_deadline > now()
       and (coalesce(p_city_key, '') = '' or v.city_key = p_city_key)
       and (coalesce(p_query, '') = ''
            or a.name ilike public.like_pattern(p_query)
            or v.city ilike public.like_pattern(p_query)
            or (not s.hide_venue_until_approved and v.name ilike public.like_pattern(p_query)))
  )
  select id, count(*) over () from matches order by date, id limit p_limit offset p_offset
$function$;

CREATE OR REPLACE FUNCTION public.open_show_cities()
 RETURNS TABLE(city text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select distinct on (v.city_key) v.city
    from public.shows s
    join public.show_opportunities o on o.show_id = s.id
    join public.venues v on v.id = s.venue_id
   where s.status in ('published', 'postponed')
     and s.date >= public.show_today()
     and o.published_at is not null and o.application_deadline > now()
   order by v.city_key, v.city
$function$;

CREATE OR REPLACE FUNCTION public.owner_stats()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
                    where s.status = 'published' and s.date >= public.show_today()
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
$function$;

CREATE OR REPLACE FUNCTION public.schedule_due_jobs(p_limit integer DEFAULT 500)
 RETURNS TABLE(kind text, enqueued integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  n int;
  show_day date := public.show_today();
  six_hour_bucket bigint := floor(extract(epoch from now()) / 21600);
  week_bucket bigint := floor(extract(epoch from now()) / 604800);
begin
  -- 0 · Place holds that are due.
  insert into public.jobs (kind, payload, dedupe_key, priority, company_id)
  select 'place_auth', jsonb_build_object('authId', a.id), 'place_auth:' || a.id || ':' || a.attempt_count, 0, a.company_id
    from public.authorization_records a
   where a.status = 'scheduled' and a.scheduled_for <= now()
     and not exists (select 1 from public.jobs j where j.dedupe_key = 'place_auth:' || a.id || ':' || a.attempt_count)
   order by a.scheduled_for limit p_limit
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count; kind := 'place_auth'; enqueued := n; return next;

  -- 0 · Holds past their network expiry.
  insert into public.jobs (kind, payload, dedupe_key, priority, company_id)
  select 'expire_hold', jsonb_build_object('authId', a.id), 'expire_hold:' || a.id, 0, a.company_id
    from public.authorization_records a
   where a.status = 'authorized' and a.expires_at < now()
     and not exists (select 1 from public.jobs j where j.dedupe_key = 'expire_hold:' || a.id)
   order by a.expires_at limit p_limit
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count; kind := 'expire_hold'; enqueued := n; return next;

  -- 0 · Bookings whose card-fix grace period lapsed.
  insert into public.jobs (kind, payload, dedupe_key, priority, company_id)
  select 'grace_cancel', jsonb_build_object('bookingId', a.booking_id), 'grace_cancel:' || a.id, 0, a.company_id
    from public.authorization_records a
   where a.status = 'failed' and a.grace_deadline_at < now()
     and not exists (select 1 from public.jobs j where j.dedupe_key = 'grace_cancel:' || a.id)
   order by a.grace_deadline_at limit p_limit
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count; kind := 'grace_cancel'; enqueued := n; return next;

  -- 1 · Approvals nobody accepted in time.
  insert into public.jobs (kind, payload, dedupe_key, priority, company_id)
  select 'expire_booking', jsonb_build_object('bookingId', b.id), 'expire_booking:' || b.id, 1, b.company_id
    from public.bookings b
   where b.status in ('awaiting_acceptance', 'awaiting_payment_method') and b.acceptance_deadline_at < now()
     and not exists (select 1 from public.jobs j where j.dedupe_key = 'expire_booking:' || b.id)
   order by b.acceptance_deadline_at limit p_limit
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count; kind := 'expire_booking'; enqueued := n; return next;

  -- 1 · Photo check-ins nobody reviewed for 48 hours (if the label allows).
  insert into public.jobs (kind, payload, dedupe_key, priority, company_id)
  select 'auto_release', jsonb_build_object('bookingId', s.booking_id, 'companyId', s.company_id),
         'auto_release:' || s.id, 1, s.company_id
    from public.attendance_submissions s
    join public.companies c on c.id = s.company_id and c.auto_release_attendance
   where s.status = 'submitted' and s.created_at < now() - interval '48 hours'
     and not exists (select 1 from public.jobs j where j.dedupe_key = 'auto_release:' || s.id)
   order by s.created_at limit p_limit
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count; kind := 'auto_release'; enqueued := n; return next;

  -- 2 · "Your approval expires soon" (≤ 6 h left).
  insert into public.jobs (kind, payload, dedupe_key, priority, company_id)
  select 'remind_accept', jsonb_build_object('bookingId', b.id), 'remind_accept:' || b.id, 2, b.company_id
    from public.bookings b
   where b.status = 'awaiting_acceptance'
     and b.acceptance_deadline_at > now() and b.acceptance_deadline_at < now() + interval '6 hours'
     and not exists (select 1 from public.jobs j where j.dedupe_key = 'remind_accept:' || b.id)
     and not exists (select 1 from public.notifications x
                      where x.user_id = b.creator_id and x.type = 'approval_expiring' and x.link = '/creator/bookings/' || b.id)
   order by b.acceptance_deadline_at limit p_limit
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count; kind := 'remind_accept'; enqueued := n; return next;

  -- 2 · Labels: decide on no-shows before the hold lapses (morning after the show).
  insert into public.jobs (kind, payload, dedupe_key, priority, company_id)
  select 'no_show_decision', jsonb_build_object('bookingId', b.id), 'no_show_decision:' || b.id, 2, b.company_id
    from public.bookings b
    join public.shows s on s.id = b.show_id
    join public.authorization_records a on a.booking_id = b.id and a.status = 'authorized' and a.expires_at > now()
   where b.status in ('confirmed', 'no_show_review') and b.attendance_state in ('not_started', 'rejected')
     and s.date::timestamp + interval '32 hours' <= (now() at time zone 'UTC')
     and not exists (select 1 from public.jobs j where j.dedupe_key = 'no_show_decision:' || b.id)
     and not exists (select 1 from public.notifications x where x.type = 'no_show_decision_due' and x.link = '/label/bookings/' || b.id)
   order by s.date limit p_limit
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count; kind := 'no_show_decision'; enqueued := n; return next;

  -- 3 · "Your show is tomorrow".
  insert into public.jobs (kind, payload, dedupe_key, priority, company_id)
  select 'remind_show', jsonb_build_object('bookingId', b.id), 'remind_show:' || b.id, 3, b.company_id
    from public.bookings b
    join public.shows s on s.id = b.show_id
   where b.status in ('confirmed', 'authorization_failed') and s.date = show_day + 1
     and not exists (select 1 from public.jobs j where j.dedupe_key = 'remind_show:' || b.id)
     and not exists (select 1 from public.notifications x
                      where x.user_id = b.creator_id and x.type = 'upcoming_show_reminder' and x.link = '/creator/bookings/' || b.id)
   order by b.id limit p_limit
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count; kind := 'remind_show'; enqueued := n; return next;

  -- 3 · Content due within 48 h.
  insert into public.jobs (kind, payload, dedupe_key, priority, company_id)
  select 'remind_content', jsonb_build_object('bookingId', b.id), 'remind_content:' || b.id, 3, b.company_id
    from public.bookings b
   where b.content_state in ('pending', 'revision_requested') and b.status in ('attended', 'confirmed')
     and b.content_deadline_at > now() and b.content_deadline_at < now() + interval '48 hours'
     and not exists (select 1 from public.jobs j where j.dedupe_key = 'remind_content:' || b.id)
     and not exists (select 1 from public.notifications x
                      where x.user_id = b.creator_id and x.type = 'content_deadline_approaching' and x.link = '/creator/bookings/' || b.id)
   order by b.content_deadline_at limit p_limit
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count; kind := 'remind_content'; enqueued := n; return next;

  -- 6 · Re-check posted content every 6 hours (views, still live?).
  insert into public.jobs (kind, payload, dedupe_key, priority, company_id)
  select 'verify_content', jsonb_build_object('submissionId', c.id),
         'verify_content:' || c.id || ':' || six_hour_bucket, 6, c.company_id
    from public.content_submissions c
   where c.status in ('submitted', 'approved')
     and (c.last_checked_at is null or c.last_checked_at < now() - interval '6 hours')
     and not exists (select 1 from public.jobs j where j.dedupe_key = 'verify_content:' || c.id || ':' || six_hour_bucket)
   order by c.last_checked_at nulls first limit p_limit
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count; kind := 'verify_content'; enqueued := n; return next;

  -- 7 · Put venues on the map (retry misses weekly).
  insert into public.jobs (kind, payload, dedupe_key, priority)
  select 'geocode', jsonb_build_object('venueId', v.id), 'geocode:' || v.id || ':' || week_bucket, 7
    from public.venues v
   where v.latitude is null and (v.geocoded_at is null or v.geocoded_at < now() - interval '7 days')
     and not exists (select 1 from public.jobs j where j.dedupe_key = 'geocode:' || v.id || ':' || week_bucket)
   order by v.geocoded_at nulls first limit p_limit
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count; kind := 'geocode'; enqueued := n; return next;

  -- 9 · "Finish your setup": day 1 and day 4 after sign-up, two at most,
  --     3+ days apart, accounts under 21 days (see lib/setup-reminders.ts).
  insert into public.jobs (kind, payload, dedupe_key, priority)
  select 'setup_reminder', jsonb_build_object('userId', u.id), 'setup_reminder:' || u.id || ':' || (r.sent + 1), 9
    from public.users u
    left join public.creator_profiles p on p.user_id = u.id
    cross join lateral (
      select count(*)::int as sent, max(x.created_at) as last
        from public.notifications x where x.user_id = u.id and x.type = 'setup_reminder'
    ) r
   where u.role = 'creator' and u.status = 'active' and not u.managed_profile
     and u.created_at > now() - interval '21 days'
     and (p.onboarded_at is null
          or not exists (select 1 from public.payment_methods pm where pm.user_id = u.id and pm.agency_id is null))
     and r.sent < 2
     and u.created_at < now() - (case when r.sent = 0 then interval '1 day' else interval '4 days' end)
     and (r.last is null or r.last < now() - interval '3 days')
     and not exists (select 1 from public.jobs j where j.dedupe_key = 'setup_reminder:' || u.id || ':' || (r.sent + 1))
   order by u.created_at limit p_limit
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count; kind := 'setup_reminder'; enqueued := n; return next;
end $function$;
