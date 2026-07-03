-- Atomic inventory + read-state helpers, called by the service layer only.

create or replace function public.reserve_tickets(p_opportunity_id uuid, p_count int)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  update public.show_opportunities
  set tickets_claimed = tickets_claimed + p_count
  where id = p_opportunity_id
    and tickets_claimed + p_count <= tickets_total;
  return found;
end $$;

create or replace function public.release_tickets(p_opportunity_id uuid, p_count int)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  update public.show_opportunities
  set tickets_claimed = greatest(0, tickets_claimed - p_count)
  where id = p_opportunity_id;
  return found;
end $$;

create or replace function public.mark_thread_read(p_thread_id uuid, p_user_id uuid)
returns void
language sql
security definer set search_path = public
as $$
  update public.messages
  set read_by = read_by || p_user_id
  where thread_id = p_thread_id
    and not (read_by @> array[p_user_id]);
$$;

-- Service-role only; keep them off the public RPC surface.
revoke execute on function public.reserve_tickets(uuid, int) from anon, authenticated, public;
revoke execute on function public.release_tickets(uuid, int) from anon, authenticated, public;
revoke execute on function public.mark_thread_read(uuid, uuid) from anon, authenticated, public;
