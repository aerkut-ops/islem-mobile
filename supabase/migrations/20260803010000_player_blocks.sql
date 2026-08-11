create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_different_users check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_created_idx
  on public.user_blocks (blocked_id, created_at desc);

alter table public.user_blocks enable row level security;
revoke all on public.user_blocks from public, anon, authenticated;

create or replace function public.lock_player_pair(
  p_user_a uuid,
  p_user_b uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_a is null or p_user_b is null or p_user_a = p_user_b then
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      least(p_user_a::text, p_user_b::text)
        || ':'
        || greatest(p_user_a::text, p_user_b::text),
      0
    )
  );
end;
$$;

create or replace function public.assert_player_interaction_allowed(
  p_user_a uuid,
  p_user_b uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_a is null or p_user_b is null or p_user_a = p_user_b then
    return;
  end if;

  perform public.lock_player_pair(p_user_a, p_user_b);

  if exists (
    select 1
    from public.user_blocks block
    where
      (block.blocker_id = p_user_a and block.blocked_id = p_user_b)
      or (block.blocker_id = p_user_b and block.blocked_id = p_user_a)
  ) then
    raise exception using errcode = '42501', message = 'player_blocked';
  end if;
end;
$$;

create or replace function public.enforce_unblocked_player_interaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_a uuid;
  v_user_b uuid;
begin
  case tg_table_name
    when 'friend_requests' then
      v_user_a := new.sender_id;
      v_user_b := new.receiver_id;
    when 'friendships' then
      v_user_a := new.user_a;
      v_user_b := new.user_b;
    when 'challenge_invites' then
      v_user_a := new.sender_id;
      v_user_b := new.receiver_id;
    when 'challenge_rooms' then
      v_user_a := new.host_id;
      v_user_b := new.guest_id;
    when 'user_notifications' then
      v_user_a := new.user_id;
      v_user_b := new.actor_id;
    else
      raise exception using errcode = '55000', message = 'unsupported_social_table';
  end case;

  perform public.assert_player_interaction_allowed(v_user_a, v_user_b);
  return new;
end;
$$;

drop trigger if exists enforce_unblocked_friend_request
  on public.friend_requests;
create trigger enforce_unblocked_friend_request
before insert on public.friend_requests
for each row execute function public.enforce_unblocked_player_interaction();

drop trigger if exists enforce_unblocked_friendship
  on public.friendships;
create trigger enforce_unblocked_friendship
before insert on public.friendships
for each row execute function public.enforce_unblocked_player_interaction();

drop trigger if exists enforce_unblocked_challenge_invite
  on public.challenge_invites;
create trigger enforce_unblocked_challenge_invite
before insert on public.challenge_invites
for each row execute function public.enforce_unblocked_player_interaction();

drop trigger if exists enforce_unblocked_challenge_room
  on public.challenge_rooms;
create trigger enforce_unblocked_challenge_room
before insert on public.challenge_rooms
for each row execute function public.enforce_unblocked_player_interaction();

drop trigger if exists enforce_unblocked_user_notification
  on public.user_notifications;
create trigger enforce_unblocked_user_notification
before insert on public.user_notifications
for each row execute function public.enforce_unblocked_player_interaction();

create or replace function public.block_player(
  p_target_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  if p_target_user_id is null or p_target_user_id = v_user_id then
    raise exception using errcode = '22023', message = 'invalid_block_target';
  end if;

  if not exists (
    select 1
    from public.profiles
    where user_id = p_target_user_id and username is not null
  ) then
    raise exception using errcode = 'P0002', message = 'player_not_found';
  end if;

  perform public.lock_player_pair(v_user_id, p_target_user_id);

  insert into public.user_blocks (blocker_id, blocked_id)
  values (v_user_id, p_target_user_id)
  on conflict (blocker_id, blocked_id) do nothing;

  update public.challenge_invites
  set status = 'cancelled', responded_at = coalesce(responded_at, now())
  where
    status = 'pending'
    and least(sender_id, receiver_id) = least(v_user_id, p_target_user_id)
    and greatest(sender_id, receiver_id) = greatest(v_user_id, p_target_user_id);

  update public.challenge_rooms
  set
    status = 'cancelled',
    completed_at = coalesce(completed_at, now())
  where
    status in ('ready', 'active')
    and least(host_id, guest_id) = least(v_user_id, p_target_user_id)
    and greatest(host_id, guest_id) = greatest(v_user_id, p_target_user_id);

  delete from public.user_notifications
  where
    least(user_id, actor_id) = least(v_user_id, p_target_user_id)
    and greatest(user_id, actor_id) = greatest(v_user_id, p_target_user_id);

  delete from public.friend_requests
  where
    least(sender_id, receiver_id) = least(v_user_id, p_target_user_id)
    and greatest(sender_id, receiver_id) = greatest(v_user_id, p_target_user_id);

  delete from public.friendships
  where
    user_a = least(v_user_id, p_target_user_id)
    and user_b = greatest(v_user_id, p_target_user_id);

  return 'blocked';
end;
$$;

create or replace function public.unblock_player(
  p_target_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  if p_target_user_id is null or p_target_user_id = v_user_id then
    raise exception using errcode = '22023', message = 'invalid_block_target';
  end if;

  perform public.lock_player_pair(v_user_id, p_target_user_id);

  delete from public.user_blocks
  where blocker_id = v_user_id and blocked_id = p_target_user_id;

  return case when found then 'unblocked' else 'not_blocked' end;
end;
$$;

create or replace function public.list_blocked_players()
returns table (
  player_id uuid,
  username text,
  display_name text,
  blocked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  return query
  select
    profile.user_id,
    profile.username,
    profile.display_name,
    block.created_at
  from public.user_blocks block
  join public.profiles profile on profile.user_id = block.blocked_id
  where
    block.blocker_id = v_user_id
    and profile.username is not null
  order by block.created_at desc, profile.user_id;
end;
$$;

create or replace function public.search_players(
  p_query text,
  p_limit integer default 20
)
returns table (
  player_id uuid,
  username text,
  display_name text,
  connection_type text,
  request_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_query text := lower(btrim(coalesce(p_query, '')));
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 20);
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  v_query := ltrim(v_query, '@');
  if char_length(v_query) < 2 or char_length(v_query) > 40 then
    raise exception using errcode = '22023', message = 'invalid_search';
  end if;

  return query
  select
    profile.user_id,
    profile.username,
    profile.display_name,
    case
      when friendship.user_a is not null then 'friend'
      when request.sender_id = v_user_id then 'outgoing'
      when request.receiver_id = v_user_id then 'incoming'
      else 'none'
    end,
    request.id
  from public.profiles profile
  left join public.friendships friendship
    on friendship.user_a = least(v_user_id, profile.user_id)
    and friendship.user_b = greatest(v_user_id, profile.user_id)
  left join public.friend_requests request
    on (
      request.sender_id = v_user_id
      and request.receiver_id = profile.user_id
    )
    or (
      request.sender_id = profile.user_id
      and request.receiver_id = v_user_id
    )
  where
    profile.user_id <> v_user_id
    and profile.username is not null
    and not exists (
      select 1
      from public.user_blocks block
      where
        (block.blocker_id = v_user_id and block.blocked_id = profile.user_id)
        or (block.blocker_id = profile.user_id and block.blocked_id = v_user_id)
    )
    and (
      left(profile.username, char_length(v_query)) = v_query
      or position(v_query in lower(coalesce(profile.display_name, ''))) > 0
    )
  order by
    (profile.username = v_query) desc,
    profile.username asc
  limit v_limit;
end;
$$;

create or replace function public.list_challenge_history(
  p_limit integer default 20
)
returns table (
  room_id uuid,
  opponent_id uuid,
  opponent_username text,
  opponent_display_name text,
  outcome text,
  own_score integer,
  opponent_score integer,
  own_moves integer,
  opponent_moves integer,
  own_duration_seconds integer,
  opponent_duration_seconds integer,
  target_count integer,
  completed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  return query
  select
    history.room_id,
    history.opponent_id,
    profile.username,
    profile.display_name,
    history.outcome,
    history.own_score,
    history.opponent_score,
    history.own_moves::integer,
    history.opponent_moves::integer,
    history.own_duration_seconds,
    history.opponent_duration_seconds,
    history.target_count::integer,
    history.completed_at
  from public.challenge_match_history history
  join public.profiles profile on profile.user_id = history.opponent_id
  where
    history.user_id = v_user_id
    and profile.username is not null
    and not exists (
      select 1
      from public.user_blocks block
      where
        (block.blocker_id = v_user_id and block.blocked_id = history.opponent_id)
        or (block.blocker_id = history.opponent_id and block.blocked_id = v_user_id)
    )
  order by history.completed_at desc, history.room_id
  limit v_limit;
end;
$$;

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
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  if
    v_week_key !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or to_char(to_date(v_week_key, 'YYYY-MM-DD'), 'YYYY-MM-DD') <> v_week_key
  then
    raise exception using errcode = '22023', message = 'invalid_week_key';
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
      and not exists (
        select 1
        from public.user_blocks block
        where
          (block.blocker_id = v_user_id and block.blocked_id = weekly.user_id)
          or (block.blocker_id = weekly.user_id and block.blocked_id = v_user_id)
      )
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
  where ranked.rank_position <= 20 or ranked.player_id = v_user_id
  order by ranked.rank_position;
end;
$$;

revoke all on function public.lock_player_pair(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.assert_player_interaction_allowed(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.enforce_unblocked_player_interaction()
  from public, anon, authenticated;
revoke all on function public.block_player(uuid) from public, anon;
revoke all on function public.unblock_player(uuid) from public, anon;
revoke all on function public.list_blocked_players() from public, anon;

grant execute on function public.block_player(uuid) to authenticated;
grant execute on function public.unblock_player(uuid) to authenticated;
grant execute on function public.list_blocked_players() to authenticated;
