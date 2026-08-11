drop policy if exists "weekly_scores_select"
  on public.weekly_scores;
create policy "weekly_scores_select_own"
  on public.weekly_scores
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "monthly_scores_select"
  on public.monthly_scores;
create policy "monthly_scores_select_own"
  on public.monthly_scores
  for select
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.list_friend_weekly_leaderboard(
  p_week_key text default null
)
returns table (
  rank_position bigint,
  player_id uuid,
  username text,
  display_name text,
  score integer,
  is_current_user boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_week_key text := coalesce(
    nullif(btrim(p_week_key), ''),
    public.get_week_key(current_date)
  );
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'authentication_required';
  end if;

  if v_week_key !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception using
      errcode = '22023',
      message = 'invalid_week_key';
  end if;

  return query
  with participant_ids as (
    select v_user_id as user_id

    union

    select
      case
        when f.user_a = v_user_id then f.user_b
        else f.user_a
      end
    from public.friendships f
    where f.user_a = v_user_id or f.user_b = v_user_id
  ),
  participants as (
    select
      p.user_id as player_id,
      p.username,
      p.display_name,
      coalesce(ws.score, 0)::integer as score,
      p.user_id = v_user_id as is_current_user
    from participant_ids ids
    join public.profiles p on p.user_id = ids.user_id
    left join public.weekly_scores ws
      on ws.user_id = ids.user_id
      and ws.week_key = v_week_key
  )
  select
    row_number() over (
      order by
        participants.score desc,
        lower(
          coalesce(
            nullif(participants.display_name, ''),
            participants.username,
            ''
          )
        ),
        participants.player_id
    ) as rank_position,
    participants.player_id,
    participants.username,
    participants.display_name,
    participants.score,
    participants.is_current_user
  from participants
  order by 1;
end;
$$;

revoke all on function public.list_friend_weekly_leaderboard(text)
  from public, anon;
grant execute on function public.list_friend_weekly_leaderboard(text)
  to authenticated;
