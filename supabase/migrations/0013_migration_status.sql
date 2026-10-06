-- Lets the server (service role) read which migrations this database has
-- recorded, so /api/health and `npm run db:status` can flag a migration that
-- never reached it — the way 0007 silently went missing on prod.
create or replace function public.applied_migrations()
returns table (version text, name text)
language sql stable
security definer set search_path = ''
as $$
  select m.version::text, coalesce(m.name, '')::text
  from supabase_migrations.schema_migrations m
$$;

revoke all on function public.applied_migrations() from public, anon, authenticated;
grant execute on function public.applied_migrations() to service_role;
