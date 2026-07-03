-- ShowUp — Row Level Security
--
-- Model: the browser only ever holds the anon key, so RLS is the hard boundary
-- for direct PostgREST access. Reads are scoped per role below. Mutations are
-- deliberately NOT granted here except for a few benign self-service writes —
-- all sensitive transitions run through the server service layer (service role)
-- after explicit authorization checks. See docs/SECURITY.md.

-- ═══════════════════════ Helper functions ══════════════════════════════

create or replace function public.is_admin()
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

create or replace function public.is_company_member(cid uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.company_members
    where company_id = cid and user_id = auth.uid()
  );
$$;

create or replace function public.shares_company_with(other uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.company_members a
    join public.company_members b on a.company_id = b.company_id
    where a.user_id = auth.uid() and b.user_id = other
  );
$$;

-- ═══════════════════════ Enable RLS everywhere ═════════════════════════

do $$
declare t text;
begin
  for t in
    select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ═══════════════════════════ users ═════════════════════════════════════

create policy users_select on public.users for select
  using (id = auth.uid() or public.is_admin());

-- ═══════════════════ creator profile (self-service) ════════════════════

create policy creator_profiles_select on public.creator_profiles for select
  using (user_id = auth.uid() or public.is_admin());

create policy creator_profiles_insert on public.creator_profiles for insert
  with check (user_id = auth.uid());

create policy creator_profiles_update on public.creator_profiles for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and verified_at is null);

create policy creator_social_select on public.creator_social_accounts for select
  using (
    profile_id in (select id from public.creator_profiles where user_id = auth.uid())
    or public.is_admin()
  );

create policy creator_social_write on public.creator_social_accounts for all
  using (profile_id in (select id from public.creator_profiles where user_id = auth.uid()))
  with check (profile_id in (select id from public.creator_profiles where user_id = auth.uid()));

-- ═══════════════════════ companies & catalog ═══════════════════════════
-- Company/artist/venue/tour rows carry no PII; authenticated users may read
-- them so discovery joins work with the user-scoped client.

create policy companies_select on public.companies for select
  using (auth.uid() is not null);

create policy company_members_select on public.company_members for select
  using (user_id = auth.uid() or public.is_company_member(company_id) or public.is_admin());

create policy company_invites_select on public.company_invites for select
  using (public.is_company_member(company_id) or public.is_admin());

create policy artists_select on public.artists for select
  using (auth.uid() is not null);

create policy venues_select on public.venues for select
  using (auth.uid() is not null);

create policy tours_select on public.tours for select
  using (auth.uid() is not null);

create policy shows_select on public.shows for select
  using (
    status in ('published', 'postponed', 'completed')
    or public.is_company_member(company_id)
    or public.is_admin()
  );

create policy opportunities_select on public.show_opportunities for select
  using (
    published_at is not null
    or public.is_company_member(company_id)
    or public.is_admin()
  );

create policy deliverables_select on public.deliverable_requirements for select
  using (
    opportunity_id in (
      select id from public.show_opportunities
      where published_at is not null or public.is_company_member(company_id)
    )
    or public.is_admin()
  );

-- ═══════════════════ requests / bookings / money ═══════════════════════

create policy requests_select on public.show_requests for select
  using (creator_id = auth.uid() or public.is_company_member(company_id) or public.is_admin());

create policy request_tickets_select on public.request_tickets for select
  using (
    request_id in (
      select id from public.show_requests
      where creator_id = auth.uid() or public.is_company_member(company_id)
    )
    or public.is_admin()
  );

create policy bookings_select on public.bookings for select
  using (creator_id = auth.uid() or public.is_company_member(company_id) or public.is_admin());

create policy booking_tickets_select on public.booking_tickets for select
  using (
    booking_id in (
      select id from public.bookings
      where creator_id = auth.uid() or public.is_company_member(company_id)
    )
    or public.is_admin()
  );

create policy payment_methods_select on public.payment_methods for select
  using (user_id = auth.uid() or public.is_admin());

create policy authorizations_select on public.authorization_records for select
  using (creator_id = auth.uid() or public.is_company_member(company_id) or public.is_admin());

create policy creator_payments_select on public.creator_payment_records for select
  using (creator_id = auth.uid() or public.is_company_member(company_id) or public.is_admin());

create policy attendance_select on public.attendance_submissions for select
  using (creator_id = auth.uid() or public.is_company_member(company_id) or public.is_admin());

create policy content_select on public.content_submissions for select
  using (creator_id = auth.uid() or public.is_company_member(company_id) or public.is_admin());

-- ═══════════════════════════ messaging ═════════════════════════════════

create policy threads_select on public.message_threads for select
  using (creator_id = auth.uid() or public.is_company_member(company_id) or public.is_admin());

create policy messages_select on public.messages for select
  using (
    thread_id in (
      select id from public.message_threads
      where creator_id = auth.uid() or public.is_company_member(company_id)
    )
    or public.is_admin()
  );

-- Participants may post plain messages directly (defense-in-depth write path);
-- system/instruction messages are service-role only.
create policy messages_insert on public.messages for insert
  with check (
    sender_id = auth.uid()
    and kind in ('text', 'attachment')
    and thread_id in (
      select id from public.message_threads
      where creator_id = auth.uid() or public.is_company_member(company_id)
    )
  );

-- ═══════════════════════ notifications ═════════════════════════════════

create policy notifications_select on public.notifications for select
  using (user_id = auth.uid());

-- ═══════════════════════════ governance ════════════════════════════════

create policy disputes_select on public.disputes for select
  using (creator_id = auth.uid() or public.is_company_member(company_id) or public.is_admin());

create policy audit_logs_select on public.audit_logs for select
  using (public.is_admin());

create policy platform_settings_select on public.platform_settings for select
  using (auth.uid() is not null);

-- mock_payment_state, webhook_events, rate_limits: RLS enabled, no policies →
-- service-role only. Intentional.
