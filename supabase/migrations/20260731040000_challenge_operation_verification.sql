alter table public.challenge_rooms
  add column if not exists source_numbers integer[],
  add column if not exists target_values integer[];

alter table public.challenge_room_players
  add column if not exists available_numbers integer[] not null default '{}',
  add column if not exists solved_values integer[] not null default '{}',
  add column if not exists operation_history jsonb not null default '[]'::jsonb;

alter table public.challenge_room_players
  drop constraint if exists challenge_room_players_verified_state_check;

alter table public.challenge_room_players
  add constraint challenge_room_players_verified_state_check check (
    cardinality(available_numbers) <= 258
    and cardinality(solved_values) <= 16
    and jsonb_typeof(operation_history) = 'array'
    and jsonb_array_length(operation_history) <= 250
  );

create or replace function public.is_valid_challenge_puzzle(
  p_source_numbers integer[],
  p_target_values integer[]
)
returns boolean
language sql
immutable
strict
set search_path = public
as $$
  select
    cardinality(p_source_numbers) = 5
    and cardinality(p_target_values) = 5
    and (
      select count(distinct value) = 5
      from unnest(p_source_numbers) as source(value)
      where value between 1 and 12
    )
    and (
      select count(distinct value) = 5
      from unnest(p_target_values) as target(value)
      where value between 1 and 999
    );
$$;

drop function if exists public.ready_challenge_room(uuid);

create function public.ready_challenge_room(
  p_room_id uuid,
  p_source_numbers integer[],
  p_target_values integer[]
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.challenge_rooms%rowtype;
  v_opponent_id uuid;
  v_ready_count integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  if not public.is_valid_challenge_puzzle(
    p_source_numbers,
    p_target_values
  ) then
    raise exception using errcode = '22023', message = 'invalid_challenge_puzzle';
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

  if v_room.source_numbers is null and v_room.target_values is null then
    update public.challenge_rooms
    set
      source_numbers = p_source_numbers,
      target_values = p_target_values,
      target_count = cardinality(p_target_values)
    where id = v_room.id;

    update public.challenge_room_players
    set
      available_numbers = p_source_numbers,
      solved_values = '{}',
      operation_history = '[]'::jsonb,
      solved_targets = 0,
      moves = 0,
      score = null,
      completed_at = null,
      updated_at = now()
    where room_id = v_room.id;
  elsif
    v_room.source_numbers is distinct from p_source_numbers
    or v_room.target_values is distinct from p_target_values
  then
    raise exception using errcode = '22023', message = 'challenge_puzzle_mismatch';
  end if;

  v_opponent_id := case
    when v_room.host_id = v_user_id then v_room.guest_id
    else v_room.host_id
  end;

  update public.challenge_room_players
  set ready_at = coalesce(ready_at, now()), updated_at = now()
  where room_id = v_room.id and user_id = v_user_id;

  delete from public.user_notifications
  where
    user_id = v_user_id
    and notification_type = 'challenge_ready'
    and entity_id = v_room.id;

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

    delete from public.user_notifications
    where
      notification_type in ('challenge_accepted', 'challenge_ready')
      and entity_id = v_room.id;

    insert into public.user_notifications (
      user_id,
      actor_id,
      notification_type,
      entity_id,
      expires_at
    )
    values (
      v_opponent_id,
      v_user_id,
      'challenge_started',
      v_room.id,
      v_room.expires_at
    )
    on conflict (user_id, notification_type, entity_id) do nothing;

    return 'active';
  end if;

  if v_room.status = 'ready' and v_ready_count = 1 then
    insert into public.user_notifications (
      user_id,
      actor_id,
      notification_type,
      entity_id,
      expires_at
    )
    values (
      v_opponent_id,
      v_user_id,
      'challenge_ready',
      v_room.id,
      v_room.expires_at
    )
    on conflict (user_id, notification_type, entity_id) do nothing;
  end if;

  return v_room.status;
end;
$$;

create or replace function public.apply_challenge_operation(
  p_room_id uuid,
  p_operation_id text,
  p_a integer,
  p_b integer,
  p_op text,
  p_result integer
)
returns table (
  solved_targets integer,
  moves integer,
  hit_target boolean,
  completed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.challenge_rooms%rowtype;
  v_player public.challenge_room_players%rowtype;
  v_expected_result bigint;
  v_a_count integer;
  v_b_count integer;
  v_hit_target boolean := false;
  v_solved_values integer[];
  v_completed boolean;
  v_completed_count integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  if
    p_operation_id is null
    or p_operation_id !~ '^[A-Za-z0-9:_-]{1,80}$'
    or p_a is null
    or p_b is null
    or p_op not in ('+', '-', '×', '÷')
    or p_result is null
  then
    raise exception using errcode = '22023', message = 'invalid_challenge_operation';
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
    raise exception using errcode = 'P0002', message = 'challenge_room_not_active';
  end if;

  select *
  into v_player
  from public.challenge_room_players
  where room_id = v_room.id and user_id = v_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'challenge_player_not_found';
  end if;

  if v_player.operation_history @> jsonb_build_array(
    jsonb_build_object('operation_id', p_operation_id)
  ) then
    return query
    select
      v_player.solved_targets::integer,
      v_player.moves::integer,
      false,
      v_player.completed_at is not null;
    return;
  end if;

  if v_room.status <> 'active' or v_player.completed_at is not null then
    raise exception using errcode = '55000', message = 'challenge_already_completed';
  end if;

  if v_room.started_at is null or now() < v_room.started_at then
    raise exception using errcode = '55000', message = 'challenge_not_started';
  end if;

  select count(*)
  into v_a_count
  from unnest(v_player.available_numbers) as available(value)
  where value = p_a;

  select count(*)
  into v_b_count
  from unnest(v_player.available_numbers) as available(value)
  where value = p_b;

  if
    v_a_count = 0
    or v_b_count = 0
    or (p_a = p_b and v_a_count < 2)
  then
    raise exception using errcode = '22023', message = 'challenge_operand_unavailable';
  end if;

  v_expected_result := case p_op
    when '+' then p_a::bigint + p_b::bigint
    when '-' then p_a::bigint - p_b::bigint
    when '×' then p_a::bigint * p_b::bigint
    when '÷' then
      case
        when p_b <> 0 and p_a % p_b = 0 then p_a / p_b
        else null
      end
  end;

  if
    v_expected_result is null
    or v_expected_result <= 0
    or v_expected_result > 1000000
    or v_expected_result <> p_result
  then
    raise exception using errcode = '22023', message = 'invalid_challenge_arithmetic';
  end if;

  v_solved_values := v_player.solved_values;
  if
    p_result = any(v_room.target_values)
    and not (p_result = any(v_solved_values))
  then
    v_solved_values := array_append(v_solved_values, p_result);
    v_hit_target := true;
  end if;

  v_completed :=
    cardinality(v_solved_values) = cardinality(v_room.target_values);

  update public.challenge_room_players as player
  set
    available_numbers = array_append(player.available_numbers, p_result),
    solved_values = v_solved_values,
    solved_targets = cardinality(v_solved_values),
    moves = player.moves + 1,
    operation_history = player.operation_history || jsonb_build_array(
      jsonb_build_object(
        'operation_id', p_operation_id,
        'a', p_a,
        'b', p_b,
        'op', p_op,
        'result', p_result
      )
    ),
    score = case
      when v_completed then greatest(
        0,
        v_room.target_count * 30 - (player.moves + 1) * 2
      )
      else player.score
    end,
    completed_at = case
      when v_completed then coalesce(player.completed_at, now())
      else player.completed_at
    end,
    updated_at = now()
  where room_id = v_room.id and user_id = v_user_id
  returning player.* into v_player;

  if v_completed then
    select count(*)
    into v_completed_count
    from public.challenge_room_players
    where room_id = v_room.id and completed_at is not null;

    if v_completed_count = 2 then
      update public.challenge_rooms
      set status = 'completed', completed_at = now()
      where id = v_room.id and status = 'active';
    end if;
  end if;

  return query
  select
    v_player.solved_targets::integer,
    v_player.moves::integer,
    v_hit_target,
    v_player.completed_at is not null;
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
    and (host_id = v_user_id or guest_id = v_user_id);

  if not found then
    raise exception using errcode = 'P0002', message = 'challenge_room_not_found';
  end if;

  select *
  into v_player
  from public.challenge_room_players
  where room_id = v_room.id and user_id = v_user_id;

  if not found or v_player.completed_at is null then
    raise exception using errcode = '55000', message = 'challenge_result_not_verified';
  end if;

  return case
    when v_room.status = 'completed' then 'completed'
    else 'waiting_for_opponent'
  end;
end;
$$;

revoke all on function public.is_valid_challenge_puzzle(integer[], integer[])
  from public, anon, authenticated;
revoke all on function public.ready_challenge_room(uuid, integer[], integer[])
  from public, anon;
revoke all on function public.apply_challenge_operation(
  uuid,
  text,
  integer,
  integer,
  text,
  integer
) from public, anon;
revoke all on function public.submit_challenge_result(uuid, integer)
  from public, anon;
revoke all on function public.update_challenge_progress(uuid, integer, integer)
  from public, anon, authenticated;

grant execute on function public.ready_challenge_room(
  uuid,
  integer[],
  integer[]
) to authenticated;
grant execute on function public.apply_challenge_operation(
  uuid,
  text,
  integer,
  integer,
  text,
  integer
) to authenticated;
grant execute on function public.submit_challenge_result(uuid, integer)
  to authenticated;

drop function public.update_challenge_progress(uuid, integer, integer);
