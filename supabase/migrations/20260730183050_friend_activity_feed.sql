create or replace function public.list_friend_activity(
  p_limit integer default 12
)
returns table (
  activity_id uuid,
  player_id uuid,
  username text,
  display_name text,
  mode text,
  difficulty text,
  awarded_score integer,
  targets_solved integer,
  target_count integer,
  duration_seconds integer,
  played_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 12), 1), 20);
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'authentication_required';
  end if;

  return query
  select
    e.id,
    e.user_id,
    p.username,
    p.display_name,
    e.mode,
    e.difficulty,
    e.awarded_score,
    e.targets_solved,
    e.target_count,
    e.duration_seconds,
    e.played_at
  from public.score_events e
  join public.profiles p on p.user_id = e.user_id
  join public.friendships f
    on f.user_a = least(v_user_id, e.user_id)
    and f.user_b = greatest(v_user_id, e.user_id)
  where
    e.user_id <> v_user_id
    and e.completed = true
    and e.played_at >= now() - interval '30 days'
    and e.expires_at > now()
    and p.username is not null
  order by e.played_at desc, e.id
  limit v_limit;
end;
$$;

revoke all on function public.list_friend_activity(integer)
  from public, anon;
grant execute on function public.list_friend_activity(integer)
  to authenticated;
