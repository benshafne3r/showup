-- ShowUp — core schema
-- All money values are integer cents (USD).

-- ═══════════════════════════════ Enums ═══════════════════════════════

create type user_role as enum ('creator', 'label', 'admin');
create type account_status as enum ('active', 'suspended');
create type company_member_role as enum ('owner', 'admin', 'member');
create type show_status as enum ('draft', 'published', 'canceled', 'postponed', 'completed');
create type ticket_delivery_method as enum ('will_call', 'digital_transfer', 'guest_list', 'box_office');
create type request_status as enum ('pending', 'approved', 'rejected', 'waitlisted', 'expired', 'withdrawn');
create type booking_status as enum (
  'awaiting_acceptance', 'awaiting_payment_method', 'confirmed', 'authorization_failed',
  'attended', 'no_show_review', 'completed', 'canceled', 'disputed'
);
create type attendance_status as enum ('not_started', 'submitted', 'approved', 'rejected', 'disputed');
create type content_status as enum (
  'not_required', 'pending', 'submitted', 'revision_requested', 'approved', 'rejected', 'disputed'
);
create type authorization_status as enum (
  'not_scheduled', 'scheduled', 'pending', 'authorized', 'failed', 'released', 'captured', 'canceled'
);
create type creator_payment_status as enum (
  'not_required', 'awaiting_funding', 'funded', 'pending_fulfillment', 'ready',
  'paid', 'failed', 'disputed', 'canceled'
);
create type ticket_kind as enum ('primary', 'plus_one');
create type ticket_status as enum ('reserved', 'issued', 'used', 'unused', 'canceled');
create type deliverable_platform as enum (
  'instagram_story', 'instagram_reel', 'instagram_post', 'tiktok_video',
  'youtube_short', 'youtube_video', 'twitter_post', 'other'
);
create type social_platform as enum ('instagram', 'tiktok', 'youtube', 'twitter', 'twitch', 'other');
create type dispute_status as enum ('open', 'under_review', 'resolved', 'closed');
create type dispute_kind as enum ('attendance', 'content', 'charge', 'other');
create type message_kind as enum ('text', 'attachment', 'ticket_instructions', 'system');
create type notification_type as enum (
  'request_submitted', 'request_approved', 'request_rejected', 'request_waitlisted',
  'new_message', 'approval_expiring', 'booking_confirmed', 'payment_method_problem',
  'authorization_placed', 'authorization_released', 'authorization_captured',
  'upcoming_show_reminder', 'ticket_instructions', 'attendance_submitted',
  'attendance_approved', 'attendance_rejected', 'content_deadline_approaching',
  'content_submitted', 'content_approved', 'content_revision_requested',
  'payment_released', 'show_canceled', 'show_postponed', 'booking_canceled',
  'dispute_opened', 'dispute_resolved', 'invite_received', 'account_verified'
);

-- ═══════════════════════════ Utility trigger ═══════════════════════════

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ═══════════════════════ Identity & profiles ═══════════════════════════

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  role user_role not null default 'creator',
  status account_status not null default 'active',
  avatar_url text,
  verified_at timestamptz,
  suspended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Mirror auth.users → public.users. Role comes from vetted signup metadata;
-- 'admin' can never be assigned this way.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  requested_role text := coalesce(new.raw_user_meta_data ->> 'role', 'creator');
begin
  insert into public.users (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when requested_role = 'label' then 'label'::user_role else 'creator'::user_role end
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.creator_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  city text not null default '',
  country text not null default 'US',
  bio text not null default '',
  categories text[] not null default '{}',
  audience_size int not null default 0 check (audience_size >= 0),
  avg_views int not null default 0 check (avg_views >= 0),
  example_work jsonb not null default '[]',
  onboarded_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.creator_social_accounts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.creator_profiles(id) on delete cascade,
  platform social_platform not null,
  handle text not null,
  url text,
  followers int not null default 0 check (followers >= 0),
  avg_views int not null default 0 check (avg_views >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, platform, handle)
);

-- ═══════════════════════ Companies & catalog ═══════════════════════════

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'label' check (kind in ('label', 'management', 'agency')),
  website text,
  verified_at timestamptz,
  suspended_at timestamptz,
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role company_member_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id)
);

create table public.company_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  role company_member_role not null default 'member',
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  invited_by uuid references public.users(id) on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, email)
);

create table public.artists (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  genre text not null default '',
  image_url text,
  spotify_url text,
  instagram_handle text,
  bio text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  state text,
  country text not null default 'US',
  address text,
  capacity int check (capacity is null or capacity > 0),
  created_by_company uuid references public.companies(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tours (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  artist_id uuid not null references public.artists(id) on delete cascade,
  name text not null,
  description text not null default '',
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  artist_id uuid not null references public.artists(id) on delete cascade,
  tour_id uuid references public.tours(id) on delete set null,
  venue_id uuid not null references public.venues(id) on delete restrict,
  title text,
  date date not null,
  doors_time time,
  start_time time,
  status show_status not null default 'draft',
  image_url text,
  ticket_delivery_method ticket_delivery_method not null default 'guest_list',
  canceled_at timestamptz,
  cancel_reason text,
  postponed_from date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ═══════════════════════════ Opportunities ═════════════════════════════

create table public.show_opportunities (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null unique references public.shows(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  stated_ticket_value_cents int not null check (stated_ticket_value_cents >= 0),
  deposit_percentage int not null check (deposit_percentage between 0 and 100),
  creator_payment_cents int not null default 0 check (creator_payment_cents >= 0),
  plus_one_allowed boolean not null default true,
  tickets_total int not null check (tickets_total > 0),
  tickets_claimed int not null default 0,
  application_deadline timestamptz not null,
  content_deadline_days int not null default 7 check (content_deadline_days between 0 and 90),
  notes text not null default '',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tickets_claimed >= 0 and tickets_claimed <= tickets_total)
);

create table public.deliverable_requirements (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.show_opportunities(id) on delete cascade,
  platform deliverable_platform not null,
  quantity int not null default 1 check (quantity > 0),
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ═══════════════════════ Requests & bookings ═══════════════════════════

create table public.show_requests (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.show_opportunities(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  creator_id uuid not null references public.users(id) on delete cascade,
  status request_status not null default 'pending',
  ticket_count int not null default 1 check (ticket_count between 1 and 2),
  includes_plus_one boolean not null default false,
  message text not null default '',
  decided_at timestamptz,
  decided_by uuid references public.users(id) on delete set null,
  waitlisted_at timestamptz,
  expired_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (includes_plus_one = (ticket_count = 2))
);

-- one live request per creator per opportunity
create unique index show_requests_one_active
  on public.show_requests (opportunity_id, creator_id)
  where status in ('pending', 'approved', 'waitlisted');

create table public.request_tickets (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.show_requests(id) on delete cascade,
  kind ticket_kind not null,
  created_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.show_requests(id) on delete restrict,
  opportunity_id uuid not null references public.show_opportunities(id) on delete restrict,
  show_id uuid not null references public.shows(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict,
  creator_id uuid not null references public.users(id) on delete restrict,
  status booking_status not null default 'awaiting_acceptance',
  -- terms snapshot (immutable after acceptance)
  stated_ticket_value_cents int not null check (stated_ticket_value_cents >= 0),
  deposit_percentage int not null check (deposit_percentage between 0 and 100),
  authorization_amount_cents int not null check (authorization_amount_cents >= 0),
  creator_payment_cents int not null check (creator_payment_cents >= 0),
  ticket_count int not null check (ticket_count between 1 and 2),
  includes_plus_one boolean not null default false,
  content_required boolean not null default false,
  content_deadline_at timestamptz,
  -- lifecycle
  acceptance_deadline_at timestamptz not null,
  accepted_at timestamptz,
  terms_accepted_at timestamptz,
  terms_version text,
  attendance_state attendance_status not null default 'not_started',
  content_state content_status not null default 'not_required',
  ticket_instructions text,
  ticket_instructions_sent_at timestamptz,
  canceled_at timestamptz,
  cancel_reason text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.booking_tickets (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  kind ticket_kind not null,
  status ticket_status not null default 'reserved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ═══════════════════════════════ Money ═════════════════════════════════

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  provider text not null check (provider in ('mock', 'stripe')),
  provider_method_id text not null,
  brand text not null default 'card',
  last4 text not null default '0000',
  exp_month int check (exp_month between 1 and 12),
  exp_year int,
  verified_at timestamptz,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_method_id)
);

create table public.authorization_records (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  creator_id uuid not null references public.users(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict,
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  status authorization_status not null default 'not_scheduled',
  amount_cents int not null check (amount_cents >= 0),
  provider text not null check (provider in ('mock', 'stripe')),
  provider_intent_id text,
  idempotency_key text unique,
  scheduled_for timestamptz,
  authorized_at timestamptz,
  released_at timestamptz,
  captured_at timestamptz,
  capture_amount_cents int check (capture_amount_cents is null or capture_amount_cents >= 0),
  failed_at timestamptz,
  failure_reason text,
  grace_deadline_at timestamptz,
  attempt_count int not null default 0,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- one live authorization per booking
create unique index authorization_records_one_active
  on public.authorization_records (booking_id)
  where status in ('scheduled', 'pending', 'authorized');

create table public.creator_payment_records (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  creator_id uuid not null references public.users(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict,
  status creator_payment_status not null default 'not_required',
  amount_cents int not null check (amount_cents >= 0),
  provider text not null check (provider in ('mock', 'stripe')),
  provider_transfer_id text,
  idempotency_key text unique,
  paid_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  paused_at timestamptz,
  paused_by uuid references public.users(id) on delete set null,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id)
);

-- ═══════════════════════════ Fulfillment ═══════════════════════════════

create table public.attendance_submissions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  creator_id uuid not null references public.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  status attendance_status not null default 'submitted',
  checked_in_at timestamptz not null default now(),
  proof_paths text[] not null default '{}',
  note text not null default '',
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.content_submissions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  creator_id uuid not null references public.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  deliverable_id uuid references public.deliverable_requirements(id) on delete set null,
  status content_status not null default 'submitted',
  post_url text not null,
  proof_paths text[] not null default '{}',
  caption_note text not null default '',
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ═══════════════════════════ Communication ═════════════════════════════

create table public.message_threads (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.show_requests(id) on delete cascade,
  creator_id uuid not null references public.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  subject text not null default '',
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  sender_id uuid references public.users(id) on delete set null,
  kind message_kind not null default 'text',
  body text not null default '',
  attachment_paths text[] not null default '{}',
  read_by uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type notification_type not null,
  title text not null,
  body text not null default '',
  link text,
  read_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ═══════════════════════════ Governance ════════════════════════════════

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  creator_id uuid not null references public.users(id) on delete cascade,
  kind dispute_kind not null,
  status dispute_status not null default 'open',
  opened_by uuid not null references public.users(id) on delete cascade,
  reason text not null,
  evidence_paths text[] not null default '{}',
  resolution text,
  resolved_by uuid references public.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.users(id) on delete set null,
  actor_role text not null default 'system',
  action text not null,
  entity_type text not null,
  entity_id uuid,
  company_id uuid,
  metadata jsonb not null default '{}',
  ip text,
  created_at timestamptz not null default now()
);

create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ═══════════════════ Provider plumbing (mock/webhooks) ═════════════════

-- Simulated provider-side objects for the mock payment provider.
create table public.mock_payment_state (
  id text primary key,
  kind text not null check (kind in ('payment_method', 'intent', 'transfer')),
  state jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Webhook event dedupe ledger.
create table public.webhook_events (
  id text primary key,
  provider text not null,
  type text not null,
  payload jsonb not null default '{}',
  processed_at timestamptz not null default now()
);

-- Fixed-window rate limiting.
create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

-- ═══════════════════════════════ Indexes ═══════════════════════════════

create index on public.creator_social_accounts (profile_id);
create index on public.company_members (user_id);
create index on public.company_invites (email);
create index on public.artists (company_id);
create index on public.tours (company_id);
create index on public.tours (artist_id);
create index on public.shows (company_id);
create index on public.shows (artist_id);
create index on public.shows (tour_id);
create index on public.shows (venue_id);
create index on public.shows (status, date);
create index on public.show_opportunities (company_id);
create index on public.deliverable_requirements (opportunity_id);
create index on public.show_requests (opportunity_id, status);
create index on public.show_requests (creator_id, status);
create index on public.show_requests (company_id, status);
create index on public.request_tickets (request_id);
create index on public.bookings (creator_id, status);
create index on public.bookings (company_id, status);
create index on public.bookings (show_id);
create index on public.bookings (status, acceptance_deadline_at);
create index on public.booking_tickets (booking_id);
create index on public.payment_methods (user_id);
create index on public.authorization_records (booking_id);
create index on public.authorization_records (status, scheduled_for);
create index on public.authorization_records (status, grace_deadline_at);
create index on public.creator_payment_records (creator_id);
create index on public.creator_payment_records (company_id);
create index on public.attendance_submissions (booking_id);
create index on public.attendance_submissions (company_id, status);
create index on public.content_submissions (booking_id);
create index on public.content_submissions (company_id, status);
create index on public.message_threads (creator_id);
create index on public.message_threads (company_id);
create index on public.messages (thread_id, created_at);
create index on public.notifications (user_id, read_at);
create index on public.disputes (status);
create index on public.audit_logs (entity_type, entity_id);
create index on public.audit_logs (company_id);
create index on public.audit_logs (created_at);

-- updated_at triggers for every table that has the column
do $$
declare t text;
begin
  for t in
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'updated_at'
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;
