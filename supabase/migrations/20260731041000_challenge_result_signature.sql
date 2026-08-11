drop function if exists public.submit_challenge_result(uuid, integer);

create function public.submit_challenge_result(
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

revoke all on function public.submit_challenge_result(uuid)
  from public, anon;
grant execute on function public.submit_challenge_result(uuid)
  to authenticated;
