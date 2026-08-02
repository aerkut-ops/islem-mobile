create or replace function public.list_weekly_league_leaderboard(
  p_week_key text default null
)
returns table (
  rank_position bigint,
  participant_count bigint,
  league_key text,
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
  v_user_score integer;
  v_league_key text;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'authentication_required';
  end if;

  if
    v_week_key !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or to_char(to_date(v_week_key, 'YYYY-MM-DD'), 'YYYY-MM-DD') <> v_week_key
  then
    raise exception using
      errcode = '22023',
      message = 'invalid_week_key';
  end if;

  select coalesce(
    (
      select weekly.score
      from public.weekly_scores weekly
      where
        weekly.user_id = v_user_id
        and weekly.week_key = v_week_key
    ),
    0
  )
  into v_user_score;

  v_league_key := case
    when v_user_score >= 2000 then 'mastery'
    when v_user_score >= 1200 then 'diamond'
    when v_user_score >= 700 then 'gold'
    when v_user_score >= 300 then 'silver'
    else 'bronze'
  end;

  return query
  with eligible_players as (
    select
      profile.user_id as player_id,
      profile.username,
      profile.display_name,
      weekly.score::integer as score
    from public.weekly_scores weekly
    join public.profiles profile on profile.user_id = weekly.user_id
    where
      weekly.week_key = v_week_key
      and profile.username is not null
      and case
        when weekly.score >= 2000 then 'mastery'
        when weekly.score >= 1200 then 'diamond'
        when weekly.score >= 700 then 'gold'
        when weekly.score >= 300 then 'silver'
        else 'bronze'
      end = v_league_key
  ),
  current_player as (
    select
      profile.user_id as player_id,
      profile.username,
      profile.display_name,
      v_user_score::integer as score
    from public.profiles profile
    where
      profile.user_id = v_user_id
      and not exists (
        select 1
        from eligible_players eligible
        where eligible.player_id = v_user_id
      )
  ),
  participants as (
    select * from eligible_players
    union all
    select * from current_player
  ),
  ranked as (
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
      count(*) over () as participant_count,
      participants.player_id,
      participants.username,
      participants.display_name,
      participants.score
    from participants
  )
  select
    ranked.rank_position,
    ranked.participant_count,
    v_league_key,
    ranked.player_id,
    ranked.username,
    ranked.display_name,
    ranked.score,
    ranked.player_id = v_user_id
  from ranked
  where
    ranked.rank_position <= 20
    or ranked.player_id = v_user_id
  order by ranked.rank_position;
end;
$$;

revoke all on function public.list_weekly_league_leaderboard(text)
  from public, anon;
grant execute on function public.list_weekly_league_leaderboard(text)
  to authenticated;
