-- Labels fund content payouts (Ben, 2026-10-23): the label saves a card, it is
-- charged when they approve a creator's content, and the creator is paid from
-- that charge. A payout can only start once its funding is in place.

-- A label's card: saved under the member who added it (their Stripe
-- customer), owned by the company. A card belongs to a person, an agency, or a
-- label company, never two of them.
alter table public.payment_methods
  add column company_id uuid references public.companies(id) on delete cascade,
  add constraint payment_methods_one_owner check (agency_id is null or company_id is null);
create index payment_methods_company_id_idx on public.payment_methods (company_id) where company_id is not null;

-- Funding runs beside the payout status: unfunded → charging (leased, keyed)
-- → charged, or failed (retryable). A charged record that is then canceled is
-- refunded: charged → refunding → refunded. 'waived' = paid from ShowUp's own
-- balance (everything approved before labels paid for content).
-- funding_amount_cents = what the label's card is charged: the creator's fee
-- plus card processing (labelChargeCents in src/lib/money.ts).
alter table public.creator_payment_records
  add column funding_status text not null default 'unfunded'
    check (funding_status in ('unfunded', 'charging', 'charged', 'failed', 'refunding', 'refunded', 'waived')),
  add column funding_method_id uuid references public.payment_methods(id) on delete set null,
  add column funding_amount_cents int check (funding_amount_cents is null or funding_amount_cents >= amount_cents),
  add column funding_attempts int not null default 0,
  add column funding_key text unique,
  add column funding_intent_id text,
  add column funding_charge_id text,
  add column funding_lease_until timestamptz,
  add column funding_failure text,
  add column funded_at timestamptz,
  add column refunded_at timestamptz;

update public.creator_payment_records
   set funding_status = 'waived'
 where status in ('ready', 'paying', 'paid', 'failed');

create index creator_payment_records_funding_open_idx on public.creator_payment_records (funding_lease_until)
  where funding_status in ('charging', 'refunding');
create index creator_payment_records_refund_due_idx on public.creator_payment_records (id)
  where funding_status = 'charged' and status = 'canceled';
create index creator_payment_records_funding_method_idx on public.creator_payment_records (funding_method_id);

alter table public.payment_operations drop constraint payment_operations_kind_check;
alter table public.payment_operations add constraint payment_operations_kind_check
  check (kind in ('authorize', 'release', 'capture', 'payout', 'void', 'charge', 'refund'));

-- Claim a record's label charge: one attempt at a time, each with its own key.
create or replace function public.claim_funding(
  p_record_id uuid,
  p_method_id uuid,
  p_amount_cents int,
  p_lease_seconds int default 120
) returns setof public.creator_payment_records
language sql security definer set search_path = public as $$
  update public.creator_payment_records
     set funding_status = 'charging',
         funding_attempts = funding_attempts + 1,
         funding_key = 'fund:' || id || ':attempt' || (funding_attempts + 1),
         funding_method_id = p_method_id,
         funding_amount_cents = p_amount_cents,
         funding_intent_id = null,
         funding_lease_until = now() + make_interval(secs => p_lease_seconds),
         funding_failure = null
   where id = p_record_id
     and funding_status in ('unfunded', 'failed')
     and status in ('pending_fulfillment', 'ready', 'failed', 'disputed')
     and paused_at is null
     and amount_cents > 0
  returning *;
$$;

-- Refund the label when a charged record is canceled (one refund per record).
create or replace function public.claim_refund(p_record_id uuid, p_lease_seconds int default 120)
returns setof public.creator_payment_records
language sql security definer set search_path = public as $$
  update public.creator_payment_records
     set funding_status = 'refunding',
         funding_lease_until = now() + make_interval(secs => p_lease_seconds),
         funding_failure = null
   where id = p_record_id and funding_status = 'charged' and status = 'canceled'
  returning *;
$$;

-- Payouts now also require the money to be in: charged by the label (or
-- waived for records from before label funding).
create or replace function public.claim_payout(
  p_booking_id uuid,
  p_lease_seconds int default 120
) returns setof public.creator_payment_records
language sql security definer set search_path = public as $$
  update public.creator_payment_records
     set status = 'paying',
         attempt_count = attempt_count + 1,
         idempotency_key = 'payout:' || id || ':attempt' || (attempt_count + 1),
         lease_until = now() + make_interval(secs => p_lease_seconds),
         failure_reason = null,
         last_error = null
   where booking_id = p_booking_id and status in ('ready', 'failed') and paused_at is null
     and funding_status in ('charged', 'waived')
  returning *;
$$;

revoke all on function public.claim_funding(uuid, uuid, int, int) from public, anon, authenticated;
revoke all on function public.claim_refund(uuid, int) from public, anon, authenticated;
revoke all on function public.claim_payout(uuid, int) from public, anon, authenticated;
