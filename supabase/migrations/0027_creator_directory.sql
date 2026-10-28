-- The label Creators tab is a directory of every onboarded creator: filter by
-- city, search, select many, invite them to a show. Pages come from SQL with
-- the true total; cities come with their creator counts.
create or replace function public.creators_search(p_city_key text, p_query text, p_limit int, p_offset int)
returns table (user_id uuid, total bigint)
language sql stable security definer set search_path = public as $$
  select p.user_id, count(*) over ()
    from public.creator_profiles p
    join public.users u on u.id = p.user_id and u.status = 'active' and u.role = 'creator'
   where p.onboarded_at is not null
     and (coalesce(p_city_key, '') = '' or p.city_key = p_city_key)
     and (coalesce(p_query, '') = ''
          or u.full_name ilike public.like_pattern(p_query)
          or p.city ilike public.like_pattern(p_query)
          or p.region ilike public.like_pattern(p_query)
          or exists (select 1 from public.creator_social_accounts s
                      where s.profile_id = p.id and s.handle ilike public.like_pattern(ltrim(p_query, '@'))))
   order by p.audience_size desc, p.user_id
   limit p_limit offset p_offset
$$;

-- Cities creators live in, most creators first (label = the most common spelling).
create or replace function public.creator_cities()
returns table (city_key text, city text, creators bigint)
language sql stable security definer set search_path = public as $$
  select p.city_key, mode() within group (order by p.city), count(*)
    from public.creator_profiles p
    join public.users u on u.id = p.user_id and u.status = 'active' and u.role = 'creator'
   where p.onboarded_at is not null and p.city_key <> ''
   group by p.city_key
   order by count(*) desc, p.city_key
$$;

revoke all on function public.creators_search(text, text, int, int) from public, anon, authenticated;
revoke all on function public.creator_cities() from public, anon, authenticated;

create index if not exists creator_profiles_audience_idx on public.creator_profiles (audience_size desc)
  where onboarded_at is not null;
