-- Label invites no longer hold a ticket. A label can invite more creators
-- than it has tickets; a ticket is taken when a creator accepts, first come
-- first served. Approving a creator's own request still holds the ticket.
--
-- bookings.holds_tickets says whether a booking counts against the show's
-- tickets_claimed. Invites start false and flip to true on accept.

alter table public.bookings add column holds_tickets boolean not null default true;

-- Approve (or invite, via offer_request_tx): an invite only needs a ticket
-- left right now; it doesn't take one.
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
  is_invite boolean;
  deadline timestamptz := now() + make_interval(hours => p_accept_hours);
begin
  select * into req from public.show_requests
   where id = p_request_id and company_id = p_company_id
   for update;
  if not found then raise exception 'request_not_found'; end if;
  if req.status not in ('pending', 'waitlisted') then raise exception 'request_decided'; end if;
  n := coalesce(p_ticket_count, req.ticket_count);
  if n > req.ticket_count or n < 1 then raise exception 'too_many_tickets'; end if;
  is_invite := req.offered_at is not null;

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
  if not is_invite then
    update public.show_opportunities set tickets_claimed = tickets_claimed + n where id = opp.id;
  end if;

  hold := round(opp.stated_ticket_value_cents::numeric * n * opp.deposit_percentage / 100);
  insert into public.bookings (
    id, request_id, opportunity_id, show_id, company_id, creator_id, status,
    stated_ticket_value_cents, deposit_percentage, authorization_amount_cents, creator_payment_cents,
    ticket_count, includes_plus_one, content_required, content_state, content_deadline_at,
    acceptance_deadline_at, holds_tickets
  ) values (
    p_booking_id, req.id, req.opportunity_id, req.show_id, req.company_id, req.creator_id, 'awaiting_acceptance',
    opp.stated_ticket_value_cents, opp.deposit_percentage, hold, opp.creator_payment_cents,
    n, n = 2, opp.creator_payment_cents > 0,
    (case when opp.creator_payment_cents > 0 then 'pending' else 'not_required' end)::content_status,
    case when opp.creator_payment_cents > 0
         then (opp.show_date::timestamp + make_interval(days => opp.content_deadline_days)) at time zone 'UTC' end,
    deadline, not is_invite
  );
  insert into public.booking_tickets (booking_id, kind)
  select p_booking_id, (case when i = 1 then 'primary' else 'plus_one' end)::ticket_kind
    from generate_series(1, n) as i;

  perform public.enqueue_jobs(p_jobs);
  return query select p_booking_id, deadline, hold, n;
end $$;

-- Accept: an invite takes its ticket now, or fails with 'sold_out' if the
-- other invitees got there first.
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

  if not b.holds_tickets then
    update public.show_opportunities
       set tickets_claimed = tickets_claimed + b.ticket_count
     where id = b.opportunity_id
       and tickets_claimed + b.ticket_count <= tickets_total;
    if not found then raise exception 'sold_out'; end if;
  end if;

  update public.bookings
     set status = 'confirmed', accepted_at = now(), terms_accepted_at = now(),
         terms_version = p_terms_version, hold_agency_id = p_hold_agency_id,
         holds_tickets = true
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

-- Cancel: only a booking that holds tickets gives them back.
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

  if b.holds_tickets then
    update public.show_opportunities
       set tickets_claimed = greatest(0, tickets_claimed - b.ticket_count)
     where id = b.opportunity_id;
  end if;
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

-- Health: inventory should match the live bookings that hold tickets.
create or replace function public.booking_consistency()
returns table (problem text, ref uuid, detail text)
language sql security definer set search_path = public as $$
  select 'inventory_drift', o.id,
         'claimed ' || o.tickets_claimed || ' vs booked ' || coalesce(sum(b.ticket_count), 0)
    from public.show_opportunities o
    left join public.bookings b on b.opportunity_id = o.id and b.status <> 'canceled' and b.holds_tickets
   group by o.id, o.tickets_claimed
  having o.tickets_claimed <> coalesce(sum(b.ticket_count), 0)
  union all
  select 'approved_without_booking', r.id, 'approved ' || r.decided_at
    from public.show_requests r
   where r.status = 'approved' and r.decided_at < now() - interval '5 minutes'
     and not exists (select 1 from public.bookings b where b.request_id = r.id);
$$;

-- Open invites sent before this change give their tickets back (they stay open).
with freed as (
  update public.bookings b
     set holds_tickets = false
    from public.show_requests r
   where r.id = b.request_id
     and r.offered_at is not null
     and b.status in ('awaiting_acceptance', 'awaiting_payment_method')
  returning b.opportunity_id, b.ticket_count
)
update public.show_opportunities o
   set tickets_claimed = greatest(0, o.tickets_claimed - f.n)
  from (select opportunity_id, sum(ticket_count)::int as n from freed group by opportunity_id) f
 where o.id = f.opportunity_id;

revoke all on function public.approve_request_tx(uuid, uuid, uuid, int, uuid, int, jsonb) from public, anon, authenticated;
revoke all on function public.accept_booking_tx(uuid, uuid, uuid, uuid, text, text, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.cancel_booking_tx(uuid, text, text[], text, jsonb) from public, anon, authenticated;
revoke all on function public.booking_consistency() from public, anon, authenticated;
