-- Recoverable payment operations and retryable webhooks.
--
-- Every provider call (authorize / release / capture / payout / void) is
-- recorded in payment_operations with a stable idempotency key and a lease.
-- If the process dies mid-call, the operation stays 'started' with an expired
-- lease; the recovery job asks the provider what actually happened and
-- finishes it (or retries with the same key, which can't double-move money).

create table public.payment_operations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('authorize', 'release', 'capture', 'payout', 'void')),
  authorization_record_id uuid references public.authorization_records(id) on delete restrict,
  payment_record_id uuid references public.creator_payment_records(id) on delete restrict,
  idempotency_key text not null unique,
  status text not null default 'started' check (status in ('started', 'succeeded', 'failed')),
  provider_ref text,
  lease_until timestamptz not null,
  attempts int not null default 1,
  last_error text,
  actor_id uuid references public.users(id) on delete set null,
  actor_role text not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  check ((authorization_record_id is not null) <> (payment_record_id is not null))
);
create index payment_operations_open_idx on public.payment_operations (lease_until) where status = 'started';
create index payment_operations_auth_idx on public.payment_operations (authorization_record_id);
create index payment_operations_payment_idx on public.payment_operations (payment_record_id);
create trigger payment_operations_updated_at before update on public.payment_operations
  for each row execute function public.set_updated_at();
alter table public.payment_operations enable row level security;
revoke all on public.payment_operations from anon, authenticated;

-- Lease on the record itself while an operation is in flight, plus the last
-- provider error for the UI / ops.
alter table public.authorization_records
  add column lease_until timestamptz,
  add column last_error text;
alter table public.creator_payment_records
  add column attempt_count int not null default 0,
  add column lease_until timestamptz,
  add column last_error text;

-- Atomic claims. Each attempt gets its own idempotency key (a retry after a
-- confirmed failure must not replay the provider's cached failure), and the
-- key is stored before the provider is called so recovery can reuse it.
create or replace function public.claim_authorization(
  p_id uuid,
  p_payment_method_id uuid,
  p_lease_seconds int default 120
) returns setof public.authorization_records
language sql security definer set search_path = public as $$
  update public.authorization_records
     set status = 'pending',
         attempt_count = attempt_count + 1,
         idempotency_key = 'auth:' || booking_id || ':attempt' || (attempt_count + 1),
         payment_method_id = p_payment_method_id,
         lease_until = now() + make_interval(secs => p_lease_seconds),
         last_error = null
   where id = p_id and status in ('scheduled', 'failed')
  returning *;
$$;

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
  returning *;
$$;

revoke all on function public.claim_authorization(uuid, uuid, int) from public, anon, authenticated;
revoke all on function public.claim_payout(uuid, int) from public, anon, authenticated;

-- Webhooks: record processing state so a failure is retried instead of being
-- skipped as a "duplicate" on redelivery.
alter table public.webhook_events
  add column status text not null default 'processed'
    check (status in ('received', 'processing', 'processed', 'failed')),
  add column attempts int not null default 0,
  add column last_error text,
  add column lease_until timestamptz,
  add column received_at timestamptz not null default now();
alter table public.webhook_events alter column status set default 'received';
alter table public.webhook_events alter column processed_at drop not null;
alter table public.webhook_events alter column processed_at drop default;
create index webhook_events_unfinished_idx on public.webhook_events (received_at)
  where status in ('received', 'processing', 'failed');

-- Claim a webhook event for processing: new, failed, or abandoned (lease
-- expired) events only, so concurrent deliveries can't double-process it.
create or replace function public.claim_webhook_event(p_id text, p_lease_seconds int default 120)
returns setof public.webhook_events
language sql security definer set search_path = public as $$
  update public.webhook_events
     set status = 'processing',
         attempts = attempts + 1,
         lease_until = now() + make_interval(secs => p_lease_seconds)
   where id = p_id
     and (status in ('received', 'failed') or (status = 'processing' and lease_until < now()))
  returning *;
$$;
revoke all on function public.claim_webhook_event(text, int) from public, anon, authenticated;
