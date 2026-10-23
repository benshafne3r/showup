-- Durable scheduling. The scheduler no longer does work inside a web
-- request: schedule_due_jobs() selects work that is genuinely due, in a
-- fixed order, and enqueues one job per item with a unique key. Rows already
-- enqueued are skipped in SQL (NOT EXISTS), so a capped batch can never be
-- filled with already-handled rows and starve later ones. Workers then run
-- the jobs with leases, retries and backoff (claim_jobs / fail_job, 0023).
--
-- Priorities: 0 money (holds), 1 bookings, 2-3 reminders, 6-7 background
-- checks, 8-9 marketing email.

create table public.heartbeats (
  name text primary key,
  at timestamptz not null default now(),
  info jsonb not null default '{}'
);
alter table public.heartbeats enable row level security;
revoke all on public.heartbeats from anon, authenticated;

create or replace function public.schedule_due_jobs(p_limit int default 500)
returns table (kind text, enqueued int)
language plpgsql security definer set search_path = public as $$
declare
  n int;
  utc_today date := (now() at time zone 'UTC')::date;
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
   where b.status in ('confirmed', 'authorization_failed') and s.date = utc_today + 1
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
end $$;

-- City alerts: claim newly published opportunities AND enqueue the per-
-- recipient emails in one transaction, so an opportunity is only marked
-- announced together with the deliveries that announce it.
create or replace function public.commit_city_alerts(p_opportunity_ids uuid[], p_jobs jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare
  claimed int;
begin
  update public.show_opportunities
     set city_alerts_sent_at = now()
   where id = any (p_opportunity_ids) and city_alerts_sent_at is null;
  get diagnostics claimed = row_count;
  if claimed > 0 then
    perform public.enqueue_jobs(p_jobs);
  end if;
  return claimed;
end $$;

-- Queue health for /api/health and the owner page.
create or replace function public.job_queue_stats()
returns table (queued int, running int, dead int, oldest_due_seconds int, retrying int)
language sql security definer set search_path = public as $$
  select
    count(*) filter (where status = 'queued')::int,
    count(*) filter (where status = 'running')::int,
    count(*) filter (where status = 'dead')::int,
    coalesce(extract(epoch from now() - min(run_at) filter (where status = 'queued' and run_at <= now())), 0)::int,
    count(*) filter (where status = 'queued' and attempts > 0)::int
  from public.jobs;
$$;

create index jobs_kind_status_idx on public.jobs (kind, status);

-- Fairer claiming (replaces 0023's): within each priority level, take turns
-- across companies (round-robin by each company's own queue position), and
-- still fill the whole batch when only one company has work. Priority always
-- comes first, so money jobs are never held back for fairness.
create or replace function public.claim_jobs(
  p_worker text,
  p_limit int default 20,
  p_lease_seconds int default 120,
  p_kinds text[] default null
) returns setof public.jobs
language plpgsql security definer set search_path = public as $$
begin
  return query
  with candidates as (
    select id, priority, run_at,
           row_number() over (partition by priority, coalesce(company_id::text, '') order by run_at, id) as turn
      from public.jobs
     where ((status = 'queued' and run_at <= now()) or (status = 'running' and lease_until < now()))
       and (p_kinds is null or kind = any (p_kinds))
     order by priority, run_at, id
     limit p_limit * 20
  ), picked as (
    select c.id from candidates c
     order by c.priority, c.turn, c.run_at, c.id
     limit p_limit
  ), locked as (
    select j.id from public.jobs j
     where j.id in (select id from picked)
       and ((j.status = 'queued' and j.run_at <= now()) or (j.status = 'running' and j.lease_until < now()))
     for update skip locked
  )
  update public.jobs j
     set status = 'running',
         attempts = j.attempts + 1,
         locked_by = p_worker,
         lease_until = now() + make_interval(secs => p_lease_seconds)
    from locked
   where j.id = locked.id
  returning j.*;
end $$;

revoke all on function public.schedule_due_jobs(int) from public, anon, authenticated;
revoke all on function public.commit_city_alerts(uuid[], jsonb) from public, anon, authenticated;
revoke all on function public.job_queue_stats() from public, anon, authenticated;
