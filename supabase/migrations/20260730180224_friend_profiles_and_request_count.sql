create or replace function public.get_friend_profile(
  p_player_id uuid
)
returns table (
  player_id uuid,
  username text,
  display_name text,
  total_score integer,
  best_score integer,
  games_completed integer,
  best_streak integer,
  weekly_score integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_week_key text := public.get_week_key(current_date);
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'authentication_required';
  end if;

  if p_player_id is null then
    raise exception using
      errcode = '22023',
      message = 'invalid_friend_target';
  end if;

  if
    p_player_id <> v_user_id
    and not exists (
      select 1
      from public.friendships f
      where
        f.user_a = least(v_user_id, p_player_id)
        and f.user_b = greatest(v_user_id, p_player_id)
    )
  then
    raise exception using
      errcode = '42501',
      message = 'friend_profile_access_denied';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.user_id = p_player_id and p.username is not null
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'player_not_found';
  end if;

  return query
  select
    p.user_id,
    p.username,
    p.display_name,
    coalesce(ps.total_score, 0)::integer,
    coalesce(ps.best_score, 0)::integer,
    coalesce(ps.games_completed, 0)::integer,
    coalesce(ps.best_streak, 0)::integer,
    coalesce(ws.score, 0)::integer
  from public.profiles p
  left join public.player_stats ps on ps.user_id = p.user_id
  left join public.weekly_scores ws
    on ws.user_id = p.user_id
    and ws.week_key = v_week_key
  where p.user_id = p_player_id;
end;
$$;

create or replace function public.get_incoming_friend_request_count()
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'authentication_required';
  end if;

  select count(*)::integer
  into v_count
  from public.friend_requests
  where receiver_id = v_user_id;

  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.get_friend_profile(uuid)
  from public, anon;
revoke all on function public.get_incoming_friend_request_count()
  from public, anon;

grant execute on function public.get_friend_profile(uuid)
  to authenticated;
grant execute on function public.get_incoming_friend_request_count()
  to authenticated;
