-- Advisor fixes: pin search_path everywhere; restrict RPC surface.
-- is_admin / is_company_member / shares_company_with keep EXECUTE for
-- `authenticated` because RLS policies evaluate them as the querying role.
-- They only reveal facts about the caller, so RPC exposure is harmless.

alter function public.set_updated_at() set search_path = public;

revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.is_admin() from anon, public;
revoke execute on function public.is_company_member(uuid) from anon, public;
revoke execute on function public.shares_company_with(uuid) from anon, public;
