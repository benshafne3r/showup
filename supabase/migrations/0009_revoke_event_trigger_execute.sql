-- rls_auto_enable() is an event-trigger function (auto-enables RLS on new
-- public tables). It was executable by anon/authenticated, so PostgREST exposed
-- it at /rest/v1/rpc/rls_auto_enable. Event triggers fire as the trigger owner,
-- so revoking these grants does not affect its real job.
revoke execute on function public.rls_auto_enable() from anon, authenticated, public;
