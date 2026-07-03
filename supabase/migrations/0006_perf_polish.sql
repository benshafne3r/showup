-- Performance advisor fixes:
-- 1. Wrap auth.uid() in scalar subselects so RLS predicates evaluate once per
--    query instead of once per row (auth_rls_initplan lint).
-- 2. Split the FOR ALL policy on creator_social_accounts so SELECT isn't
--    evaluated twice (multiple_permissive_policies lint).
-- 3. Add covering indexes for foreign keys used in query paths.

-- ── 1 + 2: recreate policies with cached auth.uid() ─────────────────────

drop policy users_select on public.users;
create policy users_select on public.users for select
  using (id = (select auth.uid()) or public.is_admin());

drop policy creator_profiles_select on public.creator_profiles;
create policy creator_profiles_select on public.creator_profiles for select
  using (user_id = (select auth.uid()) or public.is_admin());

drop policy creator_profiles_insert on public.creator_profiles;
create policy creator_profiles_insert on public.creator_profiles for insert
  with check (user_id = (select auth.uid()));

drop policy creator_profiles_update on public.creator_profiles;
create policy creator_profiles_update on public.creator_profiles for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and verified_at is null);

drop policy creator_social_select on public.creator_social_accounts;
drop policy creator_social_write on public.creator_social_accounts;
create policy creator_social_select on public.creator_social_accounts for select
  using (
    profile_id in (select id from public.creator_profiles where user_id = (select auth.uid()))
    or public.is_admin()
  );
create policy creator_social_insert on public.creator_social_accounts for insert
  with check (profile_id in (select id from public.creator_profiles where user_id = (select auth.uid())));
create policy creator_social_update on public.creator_social_accounts for update
  using (profile_id in (select id from public.creator_profiles where user_id = (select auth.uid())))
  with check (profile_id in (select id from public.creator_profiles where user_id = (select auth.uid())));
create policy creator_social_delete on public.creator_social_accounts for delete
  using (profile_id in (select id from public.creator_profiles where user_id = (select auth.uid())));

drop policy companies_select on public.companies;
create policy companies_select on public.companies for select
  using ((select auth.uid()) is not null);

drop policy company_members_select on public.company_members;
create policy company_members_select on public.company_members for select
  using (user_id = (select auth.uid()) or public.is_company_member(company_id) or public.is_admin());

drop policy artists_select on public.artists;
create policy artists_select on public.artists for select
  using ((select auth.uid()) is not null);

drop policy venues_select on public.venues;
create policy venues_select on public.venues for select
  using ((select auth.uid()) is not null);

drop policy tours_select on public.tours;
create policy tours_select on public.tours for select
  using ((select auth.uid()) is not null);

drop policy requests_select on public.show_requests;
create policy requests_select on public.show_requests for select
  using (creator_id = (select auth.uid()) or public.is_company_member(company_id) or public.is_admin());

drop policy request_tickets_select on public.request_tickets;
create policy request_tickets_select on public.request_tickets for select
  using (
    request_id in (
      select id from public.show_requests
      where creator_id = (select auth.uid()) or public.is_company_member(company_id)
    )
    or public.is_admin()
  );

drop policy bookings_select on public.bookings;
create policy bookings_select on public.bookings for select
  using (creator_id = (select auth.uid()) or public.is_company_member(company_id) or public.is_admin());

drop policy booking_tickets_select on public.booking_tickets;
create policy booking_tickets_select on public.booking_tickets for select
  using (
    booking_id in (
      select id from public.bookings
      where creator_id = (select auth.uid()) or public.is_company_member(company_id)
    )
    or public.is_admin()
  );

drop policy payment_methods_select on public.payment_methods;
create policy payment_methods_select on public.payment_methods for select
  using (user_id = (select auth.uid()) or public.is_admin());

drop policy authorizations_select on public.authorization_records;
create policy authorizations_select on public.authorization_records for select
  using (creator_id = (select auth.uid()) or public.is_company_member(company_id) or public.is_admin());

drop policy creator_payments_select on public.creator_payment_records;
create policy creator_payments_select on public.creator_payment_records for select
  using (creator_id = (select auth.uid()) or public.is_company_member(company_id) or public.is_admin());

drop policy attendance_select on public.attendance_submissions;
create policy attendance_select on public.attendance_submissions for select
  using (creator_id = (select auth.uid()) or public.is_company_member(company_id) or public.is_admin());

drop policy content_select on public.content_submissions;
create policy content_select on public.content_submissions for select
  using (creator_id = (select auth.uid()) or public.is_company_member(company_id) or public.is_admin());

drop policy threads_select on public.message_threads;
create policy threads_select on public.message_threads for select
  using (creator_id = (select auth.uid()) or public.is_company_member(company_id) or public.is_admin());

drop policy messages_select on public.messages;
create policy messages_select on public.messages for select
  using (
    thread_id in (
      select id from public.message_threads
      where creator_id = (select auth.uid()) or public.is_company_member(company_id)
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
      where creator_id = (select auth.uid()) or public.is_company_member(company_id)
    )
  );

drop policy notifications_select on public.notifications;
create policy notifications_select on public.notifications for select
  using (user_id = (select auth.uid()));

drop policy disputes_select on public.disputes;
create policy disputes_select on public.disputes for select
  using (creator_id = (select auth.uid()) or public.is_company_member(company_id) or public.is_admin());

drop policy platform_settings_select on public.platform_settings;
create policy platform_settings_select on public.platform_settings for select
  using ((select auth.uid()) is not null);

-- ── 3: covering indexes for query-path foreign keys ─────────────────────

create index if not exists attendance_submissions_creator_id_idx on public.attendance_submissions (creator_id);
create index if not exists attendance_submissions_reviewed_by_idx on public.attendance_submissions (reviewed_by);
create index if not exists audit_logs_actor_id_idx on public.audit_logs (actor_id);
create index if not exists authorization_records_company_id_idx on public.authorization_records (company_id);
create index if not exists authorization_records_creator_id_idx on public.authorization_records (creator_id);
create index if not exists authorization_records_payment_method_id_idx on public.authorization_records (payment_method_id);
create index if not exists bookings_opportunity_id_idx on public.bookings (opportunity_id);
create index if not exists company_invites_invited_by_idx on public.company_invites (invited_by);
create index if not exists content_submissions_creator_id_idx on public.content_submissions (creator_id);
create index if not exists content_submissions_deliverable_id_idx on public.content_submissions (deliverable_id);
create index if not exists content_submissions_reviewed_by_idx on public.content_submissions (reviewed_by);
create index if not exists creator_payment_records_paused_by_idx on public.creator_payment_records (paused_by);
create index if not exists disputes_booking_id_idx on public.disputes (booking_id);
create index if not exists disputes_company_id_idx on public.disputes (company_id);
create index if not exists disputes_creator_id_idx on public.disputes (creator_id);
create index if not exists disputes_opened_by_idx on public.disputes (opened_by);
create index if not exists disputes_resolved_by_idx on public.disputes (resolved_by);
create index if not exists messages_sender_id_idx on public.messages (sender_id);
create index if not exists platform_settings_updated_by_idx on public.platform_settings (updated_by);
create index if not exists show_requests_decided_by_idx on public.show_requests (decided_by);
create index if not exists show_requests_show_id_idx on public.show_requests (show_id);
create index if not exists venues_created_by_company_idx on public.venues (created_by_company);
