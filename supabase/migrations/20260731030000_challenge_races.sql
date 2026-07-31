alter table public.challenge_rooms
  add column if not exists target_count smallint not null default 5;

alter table public.challenge_rooms
  drop constraint if exists challenge_rooms_target_count_check;

alter table public.challenge_rooms
  add constraint challenge_rooms_target_count_check check (
    target_count between 1 and 16
  );

create table if not exists public.challenge_room_players (
  room_id uuid not null
    references public.challenge_rooms(id) on delete cascade,
  user_id uuid not null
    references auth.users(id) on delete cascade,
  ready_at timestamptz,
  solved_targets smallint not null default 0,
  moves smallint not null default 0,
  score integer,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id),
  constraint challenge_room_players_progress_check check (
    solved_targets between 0 and 16
    and moves between 0 and 250
    and solved_targets <= moves
  ),
  constraint challenge_room_players_score_check check (
    score is null or score between 0 and 100000
  )
);

create index if not exists challenge_room_players_user_idx
  on public.challenge_room_players (user_id, updated_at desc);

alter table public.challenge_room_players enable row level security;
revoke all on public.challenge_room_players from anon, authenticated;

create or replace function public.initialize_challenge_room_players()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.challenge_room_players (room_id, user_id)
  values
    (new.id, new.host_id),
    (new.id, new.guest_id)
  on conflict (room_id, user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists initialize_challenge_room_players
  on public.challenge_rooms;

create trigger initialize_challenge_room_players
after insert on public.challenge_rooms
for each row execute function public.initialize_challenge_room_players();

insert into public.challenge_room_players (room_id, user_id)
select id, host_id from public.challenge_rooms
on conflict (room_id, user_id) do nothing;

insert into public.challenge_room_players (room_id, user_id)
select id, guest_id from public.challenge_rooms
on conflict (room_id, user_id) do nothing;

create or replace function public.ready_challenge_room(
  p_room_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.challenge_rooms%rowtype;
  v_ready_count integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select *
  into v_room
  from public.challenge_rooms
  where
    id = p_room_id
    and status in ('ready', 'active')
    and expires_at > now()
    and (host_id = v_user_id or guest_id = v_user_id)
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'challenge_room_not_found';
  end if;

  update public.challenge_room_players
  set ready_at = coalesce(ready_at, now()), updated_at = now()
  where room_id = v_room.id and user_id = v_user_id;

  select count(*)
  into v_ready_count
  from public.challenge_room_players
  where room_id = v_room.id and ready_at is not null;

  if v_room.status = 'ready' and v_ready_count = 2 then
    update public.challenge_rooms
    set
      status = 'active',
      started_at = coalesce(started_at, now() + interval '5 seconds')
    where id = v_room.id;

    return 'active';
  end if;

  return v_room.status;
end;
$$;

create or replace function public.update_challenge_progress(
  p_room_id uuid,
  p_solved_targets integer,
  p_moves integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.challenge_rooms%rowtype;
  v_player public.challenge_room_players%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select *
  into v_room
  from public.challenge_rooms
  where
    id = p_room_id
    and status = 'active'
    and expires_at > now()
    and (host_id = v_user_id or guest_id = v_user_id);

  if not found then
    raise exception using errcode = 'P0002', message = 'challenge_room_not_active';
  end if;

  if v_room.started_at is null or now() < v_room.started_at then
    raise exception using errcode = '55000', message = 'challenge_not_started';
  end if;

  select *
  into v_player
  from public.challenge_room_players
  where room_id = v_room.id and user_id = v_user_id
  for update;

  if not found or v_player.completed_at is not null then
    return false;
  end if;

  if
    p_solved_targets is null
    or p_moves is null
    or p_solved_targets < v_player.solved_targets
    or p_solved_targets > v_room.target_count
    or p_moves < v_player.moves
    or p_moves > 250
    or p_solved_targets > p_moves
  then
    raise exception using errcode = '22023', message = 'invalid_challenge_progress';
  end if;

  update public.challenge_room_players
  set
    solved_targets = p_solved_targets,
    moves = p_moves,
    updated_at = now()
  where room_id = v_room.id and user_id = v_user_id;

  return true;
end;
$$;

create or replace function public.submit_challenge_result(
  p_room_id uuid,
  p_moves integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.challenge_rooms%rowtype;
  v_player public.challenge_room_players%rowtype;
  v_completed_count integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select *
  into v_room
  from public.challenge_rooms
  where
    id = p_room_id
    and status in ('active', 'completed')
    and expires_at > now()
    and (host_id = v_user_id or guest_id = v_user_id)
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'challenge_room_not_found';
  end if;

  if v_room.status = 'completed' then
    return 'completed';
  end if;

  if v_room.started_at is null or now() < v_room.started_at then
    raise exception using errcode = '55000', message = 'challenge_not_started';
  end if;

  select *
  into v_player
  from public.challenge_room_players
  where room_id = v_room.id and user_id = v_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'challenge_player_not_found';
  end if;

  if v_player.completed_at is not null then
    return case
      when v_room.status = 'completed' then 'completed'
      else 'waiting_for_opponent'
    end;
  end if;

  if
    p_moves is null
    or p_moves < v_room.target_count
    or p_moves < v_player.moves
    or p_moves > 250
  then
    raise exception using errcode = '22023', message = 'invalid_challenge_result';
  end if;

  update public.challenge_room_players
  set
    solved_targets = v_room.target_count,
    moves = p_moves,
    score = greatest(0, v_room.target_count * 30 - p_moves * 2),
    completed_at = coalesce(completed_at, now()),
    updated_at = now()
  where
    room_id = v_room.id
    and user_id = v_user_id
    and completed_at is null;

  select count(*)
  into v_completed_count
  from public.challenge_room_players
  where room_id = v_room.id and completed_at is not null;

  if v_completed_count = 2 then
    update public.challenge_rooms
    set status = 'completed', completed_at = now()
    where id = v_room.id;
    return 'completed';
  end if;

  return 'waiting_for_opponent';
end;
$$;

drop function if exists public.list_active_challenge_rooms();

create function public.list_active_challenge_rooms()
returns table (
  room_id uuid,
  invite_id uuid,
  room_code text,
  puzzle_seed uuid,
  status text,
  is_host boolean,
  opponent_id uuid,
  opponent_username text,
  opponent_display_name text,
  created_at timestamptz,
  started_at timestamptz,
  expires_at timestamptz,
  target_count integer,
  own_ready boolean,
  opponent_ready boolean,
  own_solved_targets integer,
  opponent_solved_targets integer,
  own_moves integer,
  opponent_moves integer,
  own_score integer,
  opponent_score integer,
  own_completed_at timestamptz,
  opponent_completed_at timestamptz,
  outcome text
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
    r.id,
    r.invite_id,
    r.room_code,
    r.puzzle_seed,
    r.status,
    r.host_id = v_user_id,
    p.user_id,
    p.username,
    p.display_name,
    r.created_at,
    r.started_at,
    r.expires_at,
    r.target_count::integer,
    own_player.ready_at is not null,
    opponent_player.ready_at is not null,
    own_player.solved_targets::integer,
    opponent_player.solved_targets::integer,
    own_player.moves::integer,
    opponent_player.moves::integer,
    own_player.score,
    opponent_player.score,
    own_player.completed_at,
    opponent_player.completed_at,
    case
      when own_player.completed_at is null then 'racing'
      when opponent_player.completed_at is null then 'waiting_for_opponent'
      when own_player.completed_at < opponent_player.completed_at then 'won'
      when own_player.completed_at > opponent_player.completed_at then 'lost'
      else 'tie'
    end
  from public.challenge_rooms r
  join public.profiles p
    on p.user_id = case
      when r.host_id = v_user_id then r.guest_id
      else r.host_id
    end
  join public.challenge_room_players own_player
    on own_player.room_id = r.id and own_player.user_id = v_user_id
  join public.challenge_room_players opponent_player
    on
      opponent_player.room_id = r.id
      and opponent_player.user_id = case
        when r.host_id = v_user_id then r.guest_id
        else r.host_id
      end
  where
    r.status in ('ready', 'active', 'completed')
    and r.expires_at > now()
    and (r.host_id = v_user_id or r.guest_id = v_user_id)
    and p.username is not null
  order by r.created_at desc, r.id
  limit 5;
end;
$$;

create or replace function public.cancel_challenge_room(
  p_room_id uuid
)
returns boolean
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

  update public.challenge_rooms
  set
    status = 'cancelled',
    completed_at = coalesce(completed_at, now())
  where
    id = p_room_id
    and status in ('ready', 'active', 'completed')
    and (host_id = v_user_id or guest_id = v_user_id);

  if not found then
    return false;
  end if;

  delete from public.user_notifications
  where notification_type = 'challenge_accepted' and entity_id = p_room_id;

  return true;
end;
$$;

revoke all on function public.initialize_challenge_room_players()
  from public, anon, authenticated;
revoke all on function public.ready_challenge_room(uuid)
  from public, anon;
revoke all on function public.update_challenge_progress(uuid, integer, integer)
  from public, anon;
revoke all on function public.submit_challenge_result(uuid, integer)
  from public, anon;
revoke all on function public.list_active_challenge_rooms()
  from public, anon;
revoke all on function public.cancel_challenge_room(uuid)
  from public, anon;

grant execute on function public.ready_challenge_room(uuid)
  to authenticated;
grant execute on function public.update_challenge_progress(uuid, integer, integer)
  to authenticated;
grant execute on function public.submit_challenge_result(uuid, integer)
  to authenticated;
grant execute on function public.list_active_challenge_rooms()
  to authenticated;
grant execute on function public.cancel_challenge_room(uuid)
  to authenticated;
