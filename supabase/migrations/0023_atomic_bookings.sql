-- Atomic booking transitions + a durable job outbox.
--
-- Each booking/inventory transition (request, approve, accept, cancel,
-- expire, pass) is one SQL transaction: either everything changes or nothing
-- does, so a crash can't strand inventory or leave an approved request
-- without its booking. The notifications and follow-up work a transition
-- causes are written to `jobs` IN THE SAME TRANSACTION (outbox), so they
-- can't be lost either; the app runs them right after commit and a worker
-- retries any that didn't finish. Provider (Stripe) and email calls never
-- happen inside these transactions.

-- ── Jobs (outbox + work queue) ────────────────────────────────────────────
create table public.jobs (
  id bigserial primary key,
  kind text not null,
  payload jsonb not null default '{}',
  -- Unique delivery key: enqueueing the same work twice is a no-op.
  dedupe_key text unique,
  -- 0 = money / correctness (holds, cancellations), 9 = marketing email.
  priority smallint not null default 5,
  -- Per-company fairness when claiming.
  company_id uuid,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'dead')),
  attempts int not null default 0,
  max_attempts int not null default 8,
  run_at timestamptz not null default now(),
  locked_by text,
  lease_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create index jobs_due_idx on public.jobs (priority, run_at) where status = 'queued';
create index jobs_running_idx on public.jobs (lease_until) where status = 'running';
create trigger jobs_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();
alter table public.jobs enable row level security;
revoke all on public.jobs from anon, authenticated;

-- Insert outbox jobs from a JSON array of {kind, payload, dedupe_key, priority, company_id}.
create or replace function public.enqueue_jobs(p_jobs jsonb)
returns setof bigint
language sql security definer set search_path = public as $$
  insert into public.jobs (kind, payload, dedupe_key, priority, company_id)
  select j.kind, coalesce(j.payload, '{}'), j.dedupe_key, coalesce(j.priority, 5), j.company_id
    from jsonb_to_recordset(coalesce(p_jobs, '[]')) as j(kind text, payload jsonb, dedupe_key text, priority smallint, company_id uuid)
  on conflict (dedupe_key) do nothing
  returning id;
$$;

-- Claim up to p_limit due jobs (queued and due, or running with an expired
-- lease), most urgent first, at most a quarter of the batch from any one
-- company so a big label can't starve the rest. SKIP LOCKED lets several
-- workers claim concurrently without taking the same job.
create or replace function public.claim_jobs(
  p_worker text,
  p_limit int default 20,
  p_lease_seconds int default 120,
  p_kinds text[] default null
) returns setof public.jobs
language plpgsql security definer set search_path = public as $$
declare
  per_company int := greatest(1, p_limit / 4);
begin
  return query
  with candidates as (
    select id, priority, run_at,
           row_number() over (partition by coalesce(company_id::text, '') order by priority, run_at, id) as rn
      from public.jobs
     where ((status = 'queued' and run_at <= now()) or (status = 'running' and lease_until < now()))
       and (p_kinds is null or kind = any (p_kinds))
     order by priority, run_at, id
     limit p_limit * 8
  ), picked as (
    select c.id from candidates c
     where c.rn <= per_company
     order by c.priority, c.run_at, c.id
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

-- Claim specific outbox jobs by key: the app runs the jobs a transition just
-- enqueued right after commit, without waiting for a worker.
create or replace function public.claim_jobs_by_keys(
  p_worker text,
  p_keys text[],
  p_lease_seconds int default 120
) returns setof public.jobs
language sql security definer set search_path = public as $$
  update public.jobs
     set status = 'running',
         attempts = attempts + 1,
         locked_by = p_worker,
         lease_until = now() + make_interval(secs => p_lease_seconds)
   where dedupe_key = any (p_keys) and status = 'queued'
  returning *;
$$;

create or replace function public.complete_job(p_id bigint, p_worker text)
returns void
language sql security definer set search_path = public as $$
  update public.jobs
     set status = 'succeeded', finished_at = now(), lease_until = null, last_error = null
   where id = p_id and status = 'running' and locked_by = p_worker;
$$;

-- Retry with exponential backoff (30s, 1m, 2m … capped at 1h); dead after max_attempts.
create or replace function public.fail_job(p_id bigint, p_worker text, p_error text)
returns void
language sql security definer set search_path = public as $$
  update public.jobs
     set status = case when attempts >= max_attempts then 'dead' else 'queued' end,
         run_at = now() + least(interval '1 hour', interval '30 seconds' * power(2, greatest(attempts - 1, 0))),
         finished_at = case when attempts >= max_attempts then now() else null end,
         lease_until = null,
         last_error = left(p_error, 2000)
   where id = p_id and status = 'running' and locked_by = p_worker;
$$;

-- Idempotent notifications: a retried notify job finds its earlier row.
alter table public.notifications add column dedupe_key text;
create unique index notifications_dedupe_key on public.notifications (dedupe_key) where dedupe_key is not null;

-- ── Transitions ───────────────────────────────────────────────────────────
-- Errors are raised as short codes (e.g. 'not_enough_tickets') that the app
-- turns into messages.

create or replace function public.create_request_tx(
  p_request_id uuid,
  p_opportunity_id uuid,
  p_creator_id uuid,
  p_ticket_count int,
  p_message text,
  p_offered boolean,
  p_jobs jsonb default '[]'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  opp record;
begin
  select o.id, o.show_id, o.company_id, s.date, a.name as artist
    into opp
    from public.show_opportunities o
    join public.shows s on s.id = o.show_id
    left join public.artists a on a.id = s.artist_id
   where o.id = p_opportunity_id;
  if not found then raise exception 'opportunity_not_found'; end if;

  insert into public.show_requests
    (id, opportunity_id, show_id, company_id, creator_id, ticket_count, includes_plus_one, message, offered_at)
  values
    (p_request_id, opp.id, opp.show_id, opp.company_id, p_creator_id, p_ticket_count, p_ticket_count = 2,
     coalesce(p_message, ''), case when p_offered then now() end);

  insert into public.request_tickets (request_id, kind)
  select p_request_id, (case when i = 1 then 'primary' else 'plus_one' end)::ticket_kind
    from generate_series(1, p_ticket_count) as i;

  insert into public.message_threads (request_id, creator_id, company_id, subject)
  values (p_request_id, p_creator_id, opp.company_id, coalesce(opp.artist, 'the artist') || ' · ' || opp.date);

  perform public.enqueue_jobs(p_jobs);
  return p_request_id;
end $$;

create or replace function public.approve_request_tx(
  p_request_id uuid,
  p_company_id uuid,
  p_reviewer uuid,
  p_ticket_count int,
  p_booking_id uuid,
  p_accept_hours int,
  p_jobs jsonb default '[]'
) returns table (booking_id uuid, accept_by timestamptz, hold_cents int, tickets int)
language plpgsql security definer set search_path = public as $$
declare
  req record;
  opp record;
  n int;
  hold int;
  deadline timestamptz := now() + make_interval(hours => p_accept_hours);
begin
  select * into req from public.show_requests
   where id = p_request_id and company_id = p_company_id
   for update;
  if not found then raise exception 'request_not_found'; end if;
  if req.status not in ('pending', 'waitlisted') then raise exception 'request_decided'; end if;
  n := coalesce(p_ticket_count, req.ticket_count);
  if n > req.ticket_count or n < 1 then raise exception 'too_many_tickets'; end if;

  select o.*, s.status as show_status, s.date as show_date
    into opp
    from public.show_opportunities o join public.shows s on s.id = o.show_id
   where o.id = req.opportunity_id
   for update of o;
  if opp.show_status <> 'published' then raise exception 'show_not_open'; end if;
  if opp.tickets_claimed + n > opp.tickets_total then raise exception 'not_enough_tickets'; end if;

  update public.show_requests
     set status = 'approved', decided_at = now(), decided_by = p_reviewer
   where id = req.id;
  update public.show_opportunities set tickets_claimed = tickets_claimed + n where id = opp.id;

  hold := round(opp.stated_ticket_value_cents::numeric * n * opp.deposit_percentage / 100);
  insert into public.bookings (
    id, request_id, opportunity_id, show_id, company_id, creator_id, status,
    stated_ticket_value_cents, deposit_percentage, authorization_amount_cents, creator_payment_cents,
    ticket_count, includes_plus_one, content_required, content_state, content_deadline_at,
    acceptance_deadline_at
  ) values (
    p_booking_id, req.id, req.opportunity_id, req.show_id, req.company_id, req.creator_id, 'awaiting_acceptance',
    opp.stated_ticket_value_cents, opp.deposit_percentage, hold, opp.creator_payment_cents,
    n, n = 2, opp.creator_payment_cents > 0,
    (case when opp.creator_payment_cents > 0 then 'pending' else 'not_required' end)::content_status,
    case when opp.creator_payment_cents > 0
         then (opp.show_date::timestamp + make_interval(days => opp.content_deadline_days)) at time zone 'UTC' end,
    deadline
  );
  insert into public.booking_tickets (booking_id, kind)
  select p_booking_id, (case when i = 1 then 'primary' else 'plus_one' end)::ticket_kind
    from generate_series(1, n) as i;

  perform public.enqueue_jobs(p_jobs);
  return query select p_booking_id, deadline, hold, n;
end $$;

create or replace function public.accept_booking_tx(
  p_booking_id uuid,
  p_creator_id uuid,
  p_hold_agency_id uuid,
  p_payment_method_id uuid,
  p_provider text,
  p_terms_version text,
  p_scheduled_for timestamptz,
  p_jobs jsonb default '[]'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  b record;
  auth_id uuid;
begin
  select * into b from public.bookings where id = p_booking_id and creator_id = p_creator_id for update;
  if not found then raise exception 'booking_not_found'; end if;
  if b.status not in ('awaiting_acceptance', 'awaiting_payment_method') then raise exception 'not_acceptable'; end if;
  if b.acceptance_deadline_at < now() then raise exception 'acceptance_expired'; end if;

  update public.bookings
     set status = 'confirmed', accepted_at = now(), terms_accepted_at = now(),
         terms_version = p_terms_version, hold_agency_id = p_hold_agency_id
   where id = b.id;

  insert into public.creator_payment_records (booking_id, creator_id, company_id, status, amount_cents, provider)
  values (b.id, b.creator_id, b.company_id,
          (case when b.creator_payment_cents > 0 then 'pending_fulfillment' else 'not_required' end)::creator_payment_status,
          b.creator_payment_cents, p_provider)
  on conflict (booking_id) do nothing;

  insert into public.authorization_records
    (booking_id, creator_id, company_id, payment_method_id, status, amount_cents, provider, scheduled_for)
  values (b.id, b.creator_id, b.company_id, p_payment_method_id, 'scheduled', b.authorization_amount_cents, p_provider, p_scheduled_for)
  returning id into auth_id;

  perform public.enqueue_jobs(p_jobs);
  return auth_id;
end $$;

-- A label invite: create the request (thread + tickets, like any request)
-- and approve it, in ONE transaction.
create or replace function public.offer_request_tx(
  p_request_id uuid,
  p_booking_id uuid,
  p_opportunity_id uuid,
  p_creator_id uuid,
  p_company_id uuid,
  p_reviewer uuid,
  p_message text,
  p_accept_hours int,
  p_jobs jsonb default '[]'
) returns table (booking_id uuid, accept_by timestamptz, hold_cents int, tickets int)
language plpgsql security definer set search_path = public as $$
begin
  perform public.create_request_tx(p_request_id, p_opportunity_id, p_creator_id, 1, p_message, true, '[]');
  return query select * from public.approve_request_tx(p_request_id, p_company_id, p_reviewer, 1, p_booking_id, p_accept_hours, p_jobs);
end $$;

-- Close out a booking: inventory back, tickets and pending payment canceled,
-- unplaced holds canceled. Active holds are released by the 'release_holds'
-- job the caller enqueues in p_jobs (provider calls stay outside SQL).
create or replace function public.cancel_booking_tx(
  p_booking_id uuid,
  p_reason text,
  p_from text[],
  p_request_status text,
  p_jobs jsonb default '[]'
) returns table (creator_id uuid, company_id uuid, request_id uuid, show_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  b record;
begin
  update public.bookings bk
     set status = 'canceled', canceled_at = now(), cancel_reason = p_reason
   where bk.id = p_booking_id and bk.status::text = any (p_from)
  returning bk.* into b;
  if not found then raise exception 'not_cancellable'; end if;

  update public.show_opportunities
     set tickets_claimed = greatest(0, tickets_claimed - b.ticket_count)
   where id = b.opportunity_id;
  update public.booking_tickets set status = 'canceled' where booking_id = b.id;
  update public.creator_payment_records
     set status = 'canceled', canceled_at = now()
   where booking_id = b.id and status in ('awaiting_funding', 'funded', 'pending_fulfillment', 'ready', 'failed');
  update public.authorization_records
     set status = 'canceled', canceled_at = now(), lease_until = null
   where booking_id = b.id and status in ('scheduled', 'pending', 'failed');
  if p_request_status is not null then
    update public.show_requests
       set status = p_request_status::request_status,
           expired_at = case when p_request_status = 'expired' then now() else expired_at end,
           withdrawn_at = case when p_request_status = 'withdrawn' then now() else withdrawn_at end
     where id = b.request_id and status = 'approved';
  end if;

  perform public.enqueue_jobs(p_jobs);
  return query select b.creator_id, b.company_id, b.request_id, b.show_id;
end $$;

-- Health: inventory that disagrees with live bookings, and approvals with no booking.
create or replace function public.booking_consistency()
returns table (problem text, ref uuid, detail text)
language sql security definer set search_path = public as $$
  select 'inventory_drift', o.id,
         'claimed ' || o.tickets_claimed || ' vs booked ' || coalesce(sum(b.ticket_count), 0)
    from public.show_opportunities o
    left join public.bookings b on b.opportunity_id = o.id and b.status <> 'canceled'
   group by o.id, o.tickets_claimed
  having o.tickets_claimed <> coalesce(sum(b.ticket_count), 0)
  union all
  select 'approved_without_booking', r.id, 'approved ' || r.decided_at
    from public.show_requests r
   where r.status = 'approved' and r.decided_at < now() - interval '5 minutes'
     and not exists (select 1 from public.bookings b where b.request_id = r.id);
$$;

revoke all on function public.enqueue_jobs(jsonb) from public, anon, authenticated;
revoke all on function public.claim_jobs(text, int, int, text[]) from public, anon, authenticated;
revoke all on function public.complete_job(bigint, text) from public, anon, authenticated;
revoke all on function public.fail_job(bigint, text, text) from public, anon, authenticated;
revoke all on function public.create_request_tx(uuid, uuid, uuid, int, text, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.approve_request_tx(uuid, uuid, uuid, int, uuid, int, jsonb) from public, anon, authenticated;
revoke all on function public.accept_booking_tx(uuid, uuid, uuid, uuid, text, text, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.cancel_booking_tx(uuid, text, text[], text, jsonb) from public, anon, authenticated;
revoke all on function public.booking_consistency() from public, anon, authenticated;
revoke all on function public.claim_jobs_by_keys(text, text[], int) from public, anon, authenticated;
revoke all on function public.offer_request_tx(uuid, uuid, uuid, uuid, uuid, uuid, text, int, jsonb) from public, anon, authenticated;
