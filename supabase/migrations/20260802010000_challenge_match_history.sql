create table if not exists public.challenge_match_history (
  user_id uuid not null references auth.users(id) on delete cascade,
  room_id uuid not null,
  opponent_id uuid not null references auth.users(id) on delete cascade,
  outcome text not null,
  own_score integer not null,
  opponent_score integer not null,
  own_moves smallint not null,
  opponent_moves smallint not null,
  own_duration_seconds integer not null,
  opponent_duration_seconds integer not null,
  target_count smallint not null,
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (user_id, room_id),
  constraint challenge_match_history_different_users check (
    user_id <> opponent_id
  ),
  constraint challenge_match_history_outcome_check check (
    outcome in ('won', 'lost', 'tie')
  ),
  constraint challenge_match_history_score_check check (
    own_score between 0 and 100000
    and opponent_score between 0 and 100000
  ),
  constraint challenge_match_history_moves_check check (
    own_moves between 1 and 250
    and opponent_moves between 1 and 250
  ),
  constraint challenge_match_history_duration_check check (
    own_duration_seconds between 0 and 604800
    and opponent_duration_seconds between 0 and 604800
  ),
  constraint challenge_match_history_target_count_check check (
    target_count between 1 and 16
  )
);

create index if not exists challenge_match_history_user_completed_idx
  on public.challenge_match_history (user_id, completed_at desc);

alter table public.challenge_match_history enable row level security;
revoke all on public.challenge_match_history from anon, authenticated;

create or replace function public.archive_completed_challenge_room()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host public.challenge_room_players%rowtype;
  v_guest public.challenge_room_players%rowtype;
  v_host_outcome text;
  v_guest_outcome text;
begin
  if new.status <> 'completed' or old.status = 'completed' then
    return new;
  end if;

  select *
  into v_host
  from public.challenge_room_players
  where room_id = new.id and user_id = new.host_id;

  select *
  into v_guest
  from public.challenge_room_players
  where room_id = new.id and user_id = new.guest_id;

  if
    v_host.completed_at is null
    or v_guest.completed_at is null
    or v_host.score is null
    or v_guest.score is null
    or new.started_at is null
  then
    return new;
  end if;

  v_host_outcome := case
    when v_host.completed_at < v_guest.completed_at then 'won'
    when v_host.completed_at > v_guest.completed_at then 'lost'
    else 'tie'
  end;
  v_guest_outcome := case
    when v_host_outcome = 'won' then 'lost'
    when v_host_outcome = 'lost' then 'won'
    else 'tie'
  end;

  insert into public.challenge_match_history (
    user_id,
    room_id,
    opponent_id,
    outcome,
    own_score,
    opponent_score,
    own_moves,
    opponent_moves,
    own_duration_seconds,
    opponent_duration_seconds,
    target_count,
    completed_at
  )
  values
    (
      new.host_id,
      new.id,
      new.guest_id,
      v_host_outcome,
      v_host.score,
      v_guest.score,
      v_host.moves,
      v_guest.moves,
      least(
        604800,
        greatest(
          0,
          floor(extract(epoch from v_host.completed_at - new.started_at))::integer
        )
      ),
      least(
        604800,
        greatest(
          0,
          floor(extract(epoch from v_guest.completed_at - new.started_at))::integer
        )
      ),
      new.target_count,
      greatest(v_host.completed_at, v_guest.completed_at)
    ),
    (
      new.guest_id,
      new.id,
      new.host_id,
      v_guest_outcome,
      v_guest.score,
      v_host.score,
      v_guest.moves,
      v_host.moves,
      least(
        604800,
        greatest(
          0,
          floor(extract(epoch from v_guest.completed_at - new.started_at))::integer
        )
      ),
      least(
        604800,
        greatest(
          0,
          floor(extract(epoch from v_host.completed_at - new.started_at))::integer
        )
      ),
      new.target_count,
      greatest(v_host.completed_at, v_guest.completed_at)
    )
  on conflict (user_id, room_id) do nothing;

  delete from public.challenge_match_history history
  using (
    select user_id, room_id
    from (
      select
        user_id,
        room_id,
        row_number() over (
          partition by user_id
          order by completed_at desc, room_id
        ) as position
      from public.challenge_match_history
      where user_id in (new.host_id, new.guest_id)
    ) ranked
    where position > 100
  ) expired
  where
    history.user_id = expired.user_id
    and history.room_id = expired.room_id;

  return new;
end;
$$;

drop trigger if exists archive_completed_challenge_room
  on public.challenge_rooms;

create trigger archive_completed_challenge_room
after update of status on public.challenge_rooms
for each row
when (new.status = 'completed')
execute function public.archive_completed_challenge_room();

with completed_rooms as (
  select
    room.id as room_id,
    room.host_id,
    room.guest_id,
    room.started_at,
    room.target_count,
    host_player.moves as host_moves,
    host_player.score as host_score,
    host_player.completed_at as host_completed_at,
    guest_player.moves as guest_moves,
    guest_player.score as guest_score,
    guest_player.completed_at as guest_completed_at
  from public.challenge_rooms room
  join public.challenge_room_players host_player
    on host_player.room_id = room.id
    and host_player.user_id = room.host_id
  join public.challenge_room_players guest_player
    on guest_player.room_id = room.id
    and guest_player.user_id = room.guest_id
  where
    room.status = 'completed'
    and room.started_at is not null
    and host_player.completed_at is not null
    and guest_player.completed_at is not null
    and host_player.score is not null
    and guest_player.score is not null
), mirrored_history as (
  select
    host_id as user_id,
    room_id,
    guest_id as opponent_id,
    case
      when host_completed_at < guest_completed_at then 'won'
      when host_completed_at > guest_completed_at then 'lost'
      else 'tie'
    end as outcome,
    host_score as own_score,
    guest_score as opponent_score,
    host_moves as own_moves,
    guest_moves as opponent_moves,
    least(
      604800,
      greatest(
        0,
        floor(extract(epoch from host_completed_at - started_at))::integer
      )
    ) as own_duration_seconds,
    least(
      604800,
      greatest(
        0,
        floor(extract(epoch from guest_completed_at - started_at))::integer
      )
    ) as opponent_duration_seconds,
    target_count,
    greatest(host_completed_at, guest_completed_at) as completed_at
  from completed_rooms
  union all
  select
    guest_id,
    room_id,
    host_id,
    case
      when guest_completed_at < host_completed_at then 'won'
      when guest_completed_at > host_completed_at then 'lost'
      else 'tie'
    end,
    guest_score,
    host_score,
    guest_moves,
    host_moves,
    least(
      604800,
      greatest(
        0,
        floor(extract(epoch from guest_completed_at - started_at))::integer
      )
    ),
    least(
      604800,
      greatest(
        0,
        floor(extract(epoch from host_completed_at - started_at))::integer
      )
    ),
    target_count,
    greatest(host_completed_at, guest_completed_at)
  from completed_rooms
)
insert into public.challenge_match_history (
  user_id,
  room_id,
  opponent_id,
  outcome,
  own_score,
  opponent_score,
  own_moves,
  opponent_moves,
  own_duration_seconds,
  opponent_duration_seconds,
  target_count,
  completed_at
)
select * from mirrored_history
on conflict (user_id, room_id) do nothing;

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
  join public.profiles profile
    on profile.user_id = history.opponent_id
  where
    history.user_id = v_user_id
    and profile.username is not null
  order by history.completed_at desc, history.room_id
  limit v_limit;
end;
$$;

revoke all on function public.archive_completed_challenge_room()
  from public, anon, authenticated;
revoke all on function public.list_challenge_history(integer)
  from public, anon;
grant execute on function public.list_challenge_history(integer)
  to authenticated;
