-- Management companies ("agencies") represent a roster of creators.
--   * Labels' conversations with a managed creator route to the agency only —
--     the creator no longer sees or writes those threads (enforced in RLS too).
--   * Either the creator or the agency can request tickets for the creator.
--   * Content payouts for a managed creator go to the agency's Stripe account.
--
-- Partner accounts (labels + managers) are invite-only: sign-up roles are now
-- assigned server-side after a vetted invite, never from client metadata.

-- ═══════════════════════════ Agencies ══════════════════════════════════

create table public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website text,
  city text not null default '',
  stripe_account_id text unique,
  stripe_payouts_enabled boolean not null default false,
  stripe_onboarded_at timestamptz,
  suspended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- MVP: a manager belongs to exactly one agency.
create table public.agency_members (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  user_id uuid not null unique references public.users(id) on delete cascade,
  role company_member_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The roster. A creator belongs to at most one agency at a time; leaving
-- deletes the row (the audit log keeps the history).
create table public.agency_creators (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  creator_id uuid not null unique references public.users(id) on delete cascade,
  added_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Roster invites. Only the SHA-256 of the token is stored; the link is shown
-- once to the manager and emailed to the creator.
create table public.agency_invites (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  token_hash text not null unique,
  invited_by uuid references public.users(id) on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references public.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index agency_invites_open_email_idx
  on public.agency_invites (agency_id, lower(email))
  where accepted_at is null and revoked_at is null;

-- Private sign-up links for labels and management companies, minted by the
-- platform owner (scripts/partner-invite.ts). Single use, expiring.
create table public.partner_invites (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('label', 'manager')),
  email text,
  org_name text not null default '',
  note text not null default '',
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references public.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- Who a payout actually went to, and which agency a manager wrote for.
alter table public.creator_payment_records
  add column payee_agency_id uuid references public.agencies(id) on delete set null;
alter table public.messages
  add column sender_agency_id uuid references public.agencies(id) on delete set null;

create index agency_members_agency_id_idx on public.agency_members (agency_id);
create index agency_creators_agency_id_idx on public.agency_creators (agency_id);
create index agency_creators_added_by_idx on public.agency_creators (added_by);
create index agency_invites_agency_id_idx on public.agency_invites (agency_id);
create index agency_invites_invited_by_idx on public.agency_invites (invited_by);
create index agency_invites_accepted_by_idx on public.agency_invites (accepted_by);
create index partner_invites_used_by_idx on public.partner_invites (used_by);
create index creator_payment_records_payee_agency_id_idx
  on public.creator_payment_records (payee_agency_id);
create index messages_sender_agency_id_idx on public.messages (sender_agency_id);

create trigger set_updated_at before update on public.agencies
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.agency_members
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.agency_creators
  for each row execute function public.set_updated_at();

-- ═══════════════════════ Sign-up role hardening ════════════════════════
-- Previously the role came from client-supplied signup metadata, so anyone
-- calling auth.signUp directly could make themselves a label. Every new user
-- is now a creator; the server promotes the role after validating an invite.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'creator'::user_role
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Mirror public.users.role into the auth user's app_metadata so the proxy can
-- route by role from a claim users can't edit (user_metadata is user-writable).
create or replace function public.sync_role_claim()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                             || jsonb_build_object('role', new.role::text)
   where id = new.id;
  return new;
end $$;

create trigger sync_role_claim
  after insert or update of role on public.users
  for each row execute function public.sync_role_claim();

revoke execute on function public.sync_role_claim() from anon, authenticated, public;

-- Backfill existing accounts.
update auth.users au
   set raw_app_meta_data = coalesce(au.raw_app_meta_data, '{}'::jsonb)
                           || jsonb_build_object('role', u.role::text)
  from public.users u
 where u.id = au.id;

-- ═══════════════════════════ Helpers ═══════════════════════════════════

create or replace function public.is_agency_member(aid uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.agency_members
    where agency_id = aid and user_id = (select auth.uid())
  );
$$;

-- True when the caller is on the team of the agency that manages `cid`.
create or replace function public.manages_creator(cid uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.agency_creators ac
    join public.agency_members am on am.agency_id = ac.agency_id
    where ac.creator_id = cid and am.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_managed_creator(cid uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (select 1 from public.agency_creators where creator_id = cid);
$$;

revoke execute on function public.is_agency_member(uuid) from anon, public;
revoke execute on function public.manages_creator(uuid) from anon, public;
revoke execute on function public.is_managed_creator(uuid) from anon, public;

-- ═══════════════════════════ RLS ═══════════════════════════════════════

alter table public.agencies enable row level security;
alter table public.agency_members enable row level security;
alter table public.agency_creators enable row level security;
alter table public.agency_invites enable row level security;   -- service role only
alter table public.partner_invites enable row level security;  -- service role only

create policy agencies_select on public.agencies for select
  using (public.is_agency_member(id) or public.is_admin());

create policy agency_members_select on public.agency_members for select
  using (public.is_agency_member(agency_id) or public.is_admin());

create policy agency_creators_select on public.agency_creators for select
  using (
    creator_id = (select auth.uid())
    or public.is_agency_member(agency_id)
    or public.is_admin()
  );

-- Label threads with a managed creator belong to the agency, not the creator.
drop policy threads_select on public.message_threads;
create policy threads_select on public.message_threads for select
  using (
    (creator_id = (select auth.uid()) and not public.is_managed_creator(creator_id))
    or public.manages_creator(creator_id)
    or public.is_company_member(company_id)
    or public.is_admin()
  );

drop policy messages_select on public.messages;
create policy messages_select on public.messages for select
  using (
    thread_id in (
      select id from public.message_threads
      where (creator_id = (select auth.uid()) and not public.is_managed_creator(creator_id))
        or public.manages_creator(creator_id)
        or public.is_company_member(company_id)
    )
    or public.is_admin()
  );

drop policy messages_insert on public.messages;
create policy messages_insert on public.messages for insert
  with check (
    sender_id = (select auth.uid())
    and kind in ('text', 'attachment')
    and thread_id in (
      select id from public.message_threads
      where (creator_id = (select auth.uid()) and not public.is_managed_creator(creator_id))
        or public.manages_creator(creator_id)
        or public.is_company_member(company_id)
    )
  );
