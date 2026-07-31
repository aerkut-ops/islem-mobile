alter table public.user_notifications
  drop constraint if exists user_notifications_type_check;

alter table public.user_notifications
  add constraint user_notifications_type_check check (
    notification_type in (
      'friend_request',
      'friend_accepted',
      'challenge_invite',
      'challenge_accepted',
      'challenge_ready',
      'challenge_started'
    )
  );

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
  v_opponent_id uuid;
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

create or replace function public.cleanup_challenge_room_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid := case
    when tg_op = 'DELETE' then old.id
    else new.id
  end;
begin
  if
    tg_op = 'DELETE'
    or new.status in ('cancelled', 'completed', 'expired')
  then
    delete from public.user_notifications
    where
      notification_type in (
        'challenge_accepted',
        'challenge_ready',
        'challenge_started'
      )
      and entity_id = v_room_id;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists cleanup_challenge_room_notifications_on_update
  on public.challenge_rooms;

create trigger cleanup_challenge_room_notifications_on_update
after update of status on public.challenge_rooms
for each row
when (
  old.status is distinct from new.status
  and new.status in ('cancelled', 'completed', 'expired')
)
execute function public.cleanup_challenge_room_notifications();

drop trigger if exists cleanup_challenge_room_notifications_on_delete
  on public.challenge_rooms;

create trigger cleanup_challenge_room_notifications_on_delete
after delete on public.challenge_rooms
for each row execute function public.cleanup_challenge_room_notifications();

create or replace function public.cleanup_challenges_after_friendship_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.challenge_invites
  set status = 'cancelled', responded_at = now()
  where
    status = 'pending'
    and least(sender_id, receiver_id) = old.user_a
    and greatest(sender_id, receiver_id) = old.user_b;

  update public.challenge_rooms
  set
    status = 'cancelled',
    completed_at = coalesce(completed_at, now())
  where
    status in ('ready', 'active')
    and least(host_id, guest_id) = old.user_a
    and greatest(host_id, guest_id) = old.user_b;

  delete from public.user_notifications
  where
    notification_type in (
      'challenge_invite',
      'challenge_accepted',
      'challenge_ready',
      'challenge_started'
    )
    and least(user_id, actor_id) = old.user_a
    and greatest(user_id, actor_id) = old.user_b;

  return old;
end;
$$;

revoke all on function public.ready_challenge_room(uuid)
  from public, anon;
revoke all on function public.cleanup_challenge_room_notifications()
  from public, anon, authenticated;
revoke all on function public.cleanup_challenges_after_friendship_delete()
  from public, anon, authenticated;

grant execute on function public.ready_challenge_room(uuid)
  to authenticated;
