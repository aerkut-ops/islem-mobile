create table if not exists public.challenge_invites (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  expires_at timestamptz not null default now() + interval '24 hours',
  constraint challenge_invites_different_users check (sender_id <> receiver_id),
  constraint challenge_invites_status_check check (
    status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')
  ),
  constraint challenge_invites_expiry_check check (expires_at > created_at)
);

create table if not exists public.challenge_rooms (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null unique
    references public.challenge_invites(id) on delete cascade,
  host_id uuid not null references auth.users(id) on delete cascade,
  guest_id uuid not null references auth.users(id) on delete cascade,
  room_code text not null unique,
  puzzle_seed uuid not null default gen_random_uuid(),
  status text not null default 'ready',
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null default now() + interval '24 hours',
  constraint challenge_rooms_different_users check (host_id <> guest_id),
  constraint challenge_rooms_code_check check (
    room_code ~ '^[A-F0-9]{6}$'
  ),
  constraint challenge_rooms_status_check check (
    status in ('ready', 'active', 'completed', 'cancelled', 'expired')
  ),
  constraint challenge_rooms_expiry_check check (expires_at > created_at)
);

create unique index if not exists challenge_invites_pending_pair_unique
  on public.challenge_invites (
    least(sender_id, receiver_id),
    greatest(sender_id, receiver_id)
  )
  where status = 'pending';

create index if not exists challenge_invites_receiver_created_idx
  on public.challenge_invites (receiver_id, created_at desc)
  where status = 'pending';

create index if not exists challenge_invites_sender_created_idx
  on public.challenge_invites (sender_id, created_at desc)
  where status = 'pending';

create index if not exists challenge_rooms_host_created_idx
  on public.challenge_rooms (host_id, created_at desc)
  where status in ('ready', 'active');

create index if not exists challenge_rooms_guest_created_idx
  on public.challenge_rooms (guest_id, created_at desc)
  where status in ('ready', 'active');

alter table public.challenge_invites enable row level security;
alter table public.challenge_rooms enable row level security;

revoke all on public.challenge_invites from anon, authenticated;
revoke all on public.challenge_rooms from anon, authenticated;

alter table public.user_notifications
  drop constraint if exists user_notifications_type_check;

alter table public.user_notifications
  add constraint user_notifications_type_check check (
    notification_type in (
      'friend_request',
      'friend_accepted',
      'challenge_invite',
      'challenge_accepted'
    )
  );

create or replace function public.send_challenge_invite(
  p_target_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing public.challenge_invites%rowtype;
  v_invite public.challenge_invites%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  if p_target_user_id is null or p_target_user_id = v_user_id then
    raise exception using errcode = '22023', message = 'invalid_challenge_target';
  end if;

  if not exists (
    select 1
    from public.profiles
    where user_id = v_user_id and username is not null
  ) then
    raise exception using errcode = '22023', message = 'profile_incomplete';
  end if;

  if not exists (
    select 1
    from public.profiles
    where user_id = p_target_user_id and username is not null
  ) then
    raise exception using errcode = 'P0002', message = 'player_not_found';
  end if;

  if not exists (
    select 1
    from public.friendships
    where
      user_a = least(v_user_id, p_target_user_id)
      and user_b = greatest(v_user_id, p_target_user_id)
  ) then
    raise exception using errcode = '42501', message = 'friendship_required';
  end if;

  update public.challenge_invites
  set status = 'expired', responded_at = now()
  where
    status = 'pending'
    and expires_at <= now()
    and (
      sender_id in (v_user_id, p_target_user_id)
      or receiver_id in (v_user_id, p_target_user_id)
    );

  delete from public.user_notifications n
  where
    n.notification_type = 'challenge_invite'
    and not exists (
      select 1
      from public.challenge_invites i
      where
        i.id = n.entity_id
        and i.status = 'pending'
        and i.expires_at > now()
    );

  select *
  into v_existing
  from public.challenge_invites
  where
    status = 'pending'
    and least(sender_id, receiver_id) =
      least(v_user_id, p_target_user_id)
    and greatest(sender_id, receiver_id) =
      greatest(v_user_id, p_target_user_id)
  limit 1;

  if found then
    if v_existing.sender_id = v_user_id then
      return 'already_sent';
    end if;
    return 'incoming_pending';
  end if;

  if (
    select count(*)
    from public.challenge_invites
    where
      sender_id = v_user_id
      and status = 'pending'
      and expires_at > now()
  ) >= 10 then
    raise exception using
      errcode = '54000',
      message = 'challenge_invite_limit_reached';
  end if;

  insert into public.challenge_invites (sender_id, receiver_id)
  values (v_user_id, p_target_user_id)
  returning * into v_invite;

  insert into public.user_notifications (
    user_id,
    actor_id,
    notification_type,
    entity_id,
    created_at,
    expires_at
  )
  values (
    v_invite.receiver_id,
    v_invite.sender_id,
    'challenge_invite',
    v_invite.id,
    v_invite.created_at,
    v_invite.expires_at
  )
  on conflict (user_id, notification_type, entity_id) do nothing;

  return 'sent';
exception
  when unique_violation then
    return 'request_exists';
end;
$$;

create or replace function public.list_challenge_invites()
returns table (
  invite_id uuid,
  direction text,
  player_id uuid,
  username text,
  display_name text,
  created_at timestamptz,
  expires_at timestamptz
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
    i.id,
    case when i.receiver_id = v_user_id then 'incoming' else 'outgoing' end,
    p.user_id,
    p.username,
    p.display_name,
    i.created_at,
    i.expires_at
  from public.challenge_invites i
  join public.profiles p
    on p.user_id = case
      when i.receiver_id = v_user_id then i.sender_id
      else i.receiver_id
    end
  where
    i.status = 'pending'
    and i.expires_at > now()
    and (i.sender_id = v_user_id or i.receiver_id = v_user_id)
    and p.username is not null
  order by
    case when i.receiver_id = v_user_id then 0 else 1 end,
    i.created_at desc,
    i.id;
end;
$$;

create or replace function public.respond_challenge_invite(
  p_invite_id uuid,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite public.challenge_invites%rowtype;
  v_room public.challenge_rooms%rowtype;
  v_room_code text;
  v_attempt integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select *
  into v_invite
  from public.challenge_invites
  where
    id = p_invite_id
    and receiver_id = v_user_id
    and status = 'pending'
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'challenge_invite_not_found';
  end if;

  if v_invite.expires_at <= now() then
    update public.challenge_invites
    set status = 'expired', responded_at = now()
    where id = v_invite.id;

    delete from public.user_notifications
    where
      user_id = v_invite.receiver_id
      and notification_type = 'challenge_invite'
      and entity_id = v_invite.id;

    return jsonb_build_object('result', 'expired');
  end if;

  if not coalesce(p_accept, false) then
    update public.challenge_invites
    set status = 'declined', responded_at = now()
    where id = v_invite.id;

    delete from public.user_notifications
    where
      user_id = v_invite.receiver_id
      and notification_type = 'challenge_invite'
      and entity_id = v_invite.id;

    return jsonb_build_object('result', 'declined');
  end if;

  if not exists (
    select 1
    from public.friendships
    where
      user_a = least(v_invite.sender_id, v_invite.receiver_id)
      and user_b = greatest(v_invite.sender_id, v_invite.receiver_id)
  ) then
    raise exception using errcode = '42501', message = 'friendship_required';
  end if;

  with cancelled_rooms as (
    update public.challenge_rooms
    set
      status = 'cancelled',
      completed_at = coalesce(completed_at, now())
    where
      status in ('ready', 'active')
      and (
        host_id in (v_invite.sender_id, v_invite.receiver_id)
        or guest_id in (v_invite.sender_id, v_invite.receiver_id)
      )
    returning id
  )
  delete from public.user_notifications n
  using cancelled_rooms r
  where
    n.notification_type = 'challenge_accepted'
    and n.entity_id = r.id;

  update public.challenge_invites
  set status = 'accepted', responded_at = now()
  where id = v_invite.id;

  for v_attempt in 1..8 loop
    v_room_code := upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));
    begin
      insert into public.challenge_rooms (
        invite_id,
        host_id,
        guest_id,
        room_code
      )
      values (
        v_invite.id,
        v_invite.sender_id,
        v_invite.receiver_id,
        v_room_code
      )
      returning * into v_room;
      exit;
    exception
      when unique_violation then
        if v_attempt = 8 then
          raise;
        end if;
    end;
  end loop;

  with cancelled as (
    update public.challenge_invites
    set status = 'cancelled', responded_at = now()
    where
      id <> v_invite.id
      and status = 'pending'
      and (
        sender_id in (v_invite.sender_id, v_invite.receiver_id)
        or receiver_id in (v_invite.sender_id, v_invite.receiver_id)
      )
    returning id
  )
  delete from public.user_notifications n
  using cancelled c
  where
    n.notification_type = 'challenge_invite'
    and n.entity_id = c.id;

  delete from public.user_notifications
  where
    user_id = v_invite.receiver_id
    and notification_type = 'challenge_invite'
    and entity_id = v_invite.id;

  insert into public.user_notifications (
    user_id,
    actor_id,
    notification_type,
    entity_id,
    expires_at
  )
  values (
    v_invite.sender_id,
    v_invite.receiver_id,
    'challenge_accepted',
    v_room.id,
    v_room.expires_at
  )
  on conflict (user_id, notification_type, entity_id) do nothing;

  return jsonb_build_object(
    'result', 'accepted',
    'room', jsonb_build_object(
      'room_id', v_room.id,
      'invite_id', v_room.invite_id,
      'room_code', v_room.room_code,
      'puzzle_seed', v_room.puzzle_seed,
      'status', v_room.status,
      'is_host', false,
      'opponent_id', v_invite.sender_id,
      'created_at', v_room.created_at,
      'expires_at', v_room.expires_at
    )
  );
end;
$$;

create or replace function public.cancel_challenge_invite(
  p_invite_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite public.challenge_invites%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select *
  into v_invite
  from public.challenge_invites
  where id = p_invite_id and sender_id = v_user_id and status = 'pending'
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'challenge_invite_not_found';
  end if;

  update public.challenge_invites
  set status = 'cancelled', responded_at = now()
  where id = v_invite.id;

  delete from public.user_notifications
  where
    user_id = v_invite.receiver_id
    and notification_type = 'challenge_invite'
    and entity_id = v_invite.id;

  return 'cancelled';
end;
$$;

create or replace function public.list_active_challenge_rooms()
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
  expires_at timestamptz
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
    r.expires_at
  from public.challenge_rooms r
  join public.profiles p
    on p.user_id = case
      when r.host_id = v_user_id then r.guest_id
      else r.host_id
    end
  where
    r.status in ('ready', 'active')
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
    and status in ('ready', 'active')
    and (host_id = v_user_id or guest_id = v_user_id);

  if not found then
    return false;
  end if;

  delete from public.user_notifications
  where notification_type = 'challenge_accepted' and entity_id = p_room_id;

  return true;
end;
$$;

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
    notification_type in ('challenge_invite', 'challenge_accepted')
    and least(user_id, actor_id) = old.user_a
    and greatest(user_id, actor_id) = old.user_b;

  return old;
end;
$$;

drop trigger if exists cleanup_challenges_after_friendship_delete
  on public.friendships;

create trigger cleanup_challenges_after_friendship_delete
after delete on public.friendships
for each row execute function public.cleanup_challenges_after_friendship_delete();

revoke all on function public.send_challenge_invite(uuid)
  from public, anon;
revoke all on function public.list_challenge_invites()
  from public, anon;
revoke all on function public.respond_challenge_invite(uuid, boolean)
  from public, anon;
revoke all on function public.cancel_challenge_invite(uuid)
  from public, anon;
revoke all on function public.list_active_challenge_rooms()
  from public, anon;
revoke all on function public.cancel_challenge_room(uuid)
  from public, anon;

grant execute on function public.send_challenge_invite(uuid)
  to authenticated;
grant execute on function public.list_challenge_invites()
  to authenticated;
grant execute on function public.respond_challenge_invite(uuid, boolean)
  to authenticated;
grant execute on function public.cancel_challenge_invite(uuid)
  to authenticated;
grant execute on function public.list_active_challenge_rooms()
  to authenticated;
grant execute on function public.cancel_challenge_room(uuid)
  to authenticated;

select cron.schedule(
  'cleanup-expired-challenges',
  '37 3 * * *',
  $job$
    update public.challenge_invites
    set status = 'expired', responded_at = coalesce(responded_at, now())
    where status = 'pending' and expires_at <= now();

    update public.challenge_rooms
    set status = 'expired', completed_at = coalesce(completed_at, now())
    where status in ('ready', 'active') and expires_at <= now();

    delete from public.challenge_invites
    where created_at <= now() - interval '30 days';
  $job$
)
where not exists (
  select 1
  from cron.job
  where jobname = 'cleanup-expired-challenges'
);
