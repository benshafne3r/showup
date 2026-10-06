-- rls_auto_enable() is an event-trigger function (auto-enables RLS on new
-- public tables). It was executable by anon/authenticated, so PostgREST exposed
-- it at /rest/v1/rpc/rls_auto_enable. Event triggers fire as the trigger owner,
-- so revoking these grants does not affect its real job.
-- The function is created by a Supabase dashboard setting, so it exists on the
-- hosted project but not on a local stack — skip quietly when it's absent.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from anon, authenticated, public;
  end if;
end $$;
