create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null,
  entity_id uuid not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  constraint user_notifications_different_users check (user_id <> actor_id),
  constraint user_notifications_type_check check (
    notification_type in ('friend_request', 'friend_accepted')
  ),
  constraint user_notifications_expiry_check check (expires_at > created_at),
  constraint user_notifications_event_unique unique (
    user_id,
    notification_type,
    entity_id
  )
);

create index if not exists user_notifications_user_created_idx
  on public.user_notifications (user_id, created_at desc);

create index if not exists user_notifications_expires_idx
  on public.user_notifications (expires_at);

alter table public.user_notifications enable row level security;
revoke all on public.user_notifications from anon, authenticated;

insert into public.user_notifications (
  user_id,
  actor_id,
  notification_type,
  entity_id,
  created_at,
  expires_at
)
select
  r.receiver_id,
  r.sender_id,
  'friend_request',
  r.id,
  r.created_at,
  r.created_at + interval '30 days'
from public.friend_requests r
where r.created_at > now() - interval '30 days'
on conflict (user_id, notification_type, entity_id) do nothing;

create or replace function public.send_friend_request(
  p_target_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.friend_requests%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  if p_target_user_id is null or p_target_user_id = v_user_id then
    raise exception using errcode = '22023', message = 'invalid_friend_target';
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

  if exists (
    select 1
    from public.friendships
    where
      user_a = least(v_user_id, p_target_user_id)
      and user_b = greatest(v_user_id, p_target_user_id)
  ) then
    return 'already_friends';
  end if;

  select *
  into v_request
  from public.friend_requests
  where
    least(sender_id, receiver_id) = least(v_user_id, p_target_user_id)
    and greatest(sender_id, receiver_id) = greatest(v_user_id, p_target_user_id)
  limit 1;

  if found then
    if v_request.sender_id = v_user_id then
      return 'already_sent';
    end if;
    return 'incoming_exists';
  end if;

  insert into public.friend_requests (sender_id, receiver_id)
  values (v_user_id, p_target_user_id)
  returning * into v_request;

  insert into public.user_notifications (
    user_id,
    actor_id,
    notification_type,
    entity_id,
    created_at,
    expires_at
  )
  values (
    v_request.receiver_id,
    v_request.sender_id,
    'friend_request',
    v_request.id,
    v_request.created_at,
    v_request.created_at + interval '30 days'
  )
  on conflict (user_id, notification_type, entity_id) do nothing;

  return 'sent';
exception
  when unique_violation then
    return 'request_exists';
end;
$$;

create or replace function public.respond_friend_request(
  p_request_id uuid,
  p_accept boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.friend_requests%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select *
  into v_request
  from public.friend_requests
  where id = p_request_id and receiver_id = v_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'friend_request_not_found';
  end if;

  if coalesce(p_accept, false) then
    insert into public.friendships (user_a, user_b)
    values (
      least(v_request.sender_id, v_request.receiver_id),
      greatest(v_request.sender_id, v_request.receiver_id)
    )
    on conflict (user_a, user_b) do nothing;

    insert into public.user_notifications (
      user_id,
      actor_id,
      notification_type,
      entity_id
    )
    values (
      v_request.sender_id,
      v_request.receiver_id,
      'friend_accepted',
      v_request.id
    )
    on conflict (user_id, notification_type, entity_id) do nothing;
  end if;

  delete from public.user_notifications
  where
    user_id = v_request.receiver_id
    and notification_type = 'friend_request'
    and entity_id = v_request.id;

  delete from public.friend_requests
  where
    least(sender_id, receiver_id) =
      least(v_request.sender_id, v_request.receiver_id)
    and greatest(sender_id, receiver_id) =
      greatest(v_request.sender_id, v_request.receiver_id);

  return case when coalesce(p_accept, false) then 'accepted' else 'declined' end;
end;
$$;

create or replace function public.cancel_friend_request(
  p_request_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.friend_requests%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select *
  into v_request
  from public.friend_requests
  where id = p_request_id and sender_id = v_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'friend_request_not_found';
  end if;

  delete from public.user_notifications
  where
    user_id = v_request.receiver_id
    and notification_type = 'friend_request'
    and entity_id = v_request.id;

  delete from public.friend_requests
  where id = v_request.id;

  return 'cancelled';
end;
$$;

create or replace function public.list_user_notifications(
  p_limit integer default 30
)
returns table (
  notification_id uuid,
  notification_type text,
  actor_id uuid,
  actor_username text,
  actor_display_name text,
  entity_id uuid,
  is_read boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 50);
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'authentication_required';
  end if;

  return query
  select
    n.id,
    n.notification_type,
    n.actor_id,
    p.username,
    p.display_name,
    n.entity_id,
    n.read_at is not null,
    n.created_at
  from public.user_notifications n
  join public.profiles p on p.user_id = n.actor_id
  where
    n.user_id = v_user_id
    and n.expires_at > now()
    and p.username is not null
  order by n.created_at desc, n.id
  limit v_limit;
end;
$$;

create or replace function public.get_unread_notification_count()
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'authentication_required';
  end if;

  select count(*)::integer
  into v_count
  from public.user_notifications
  where
    user_id = v_user_id
    and read_at is null
    and expires_at > now();

  return coalesce(v_count, 0);
end;
$$;

create or replace function public.mark_notifications_read(
  p_notification_ids uuid[] default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'authentication_required';
  end if;

  if
    p_notification_ids is not null
    and cardinality(p_notification_ids) > 50
  then
    raise exception using
      errcode = '22023',
      message = 'too_many_notifications';
  end if;

  update public.user_notifications
  set read_at = now()
  where
    user_id = v_user_id
    and read_at is null
    and expires_at > now()
    and (
      p_notification_ids is null
      or id = any(p_notification_ids)
    );

  get diagnostics v_count = row_count;
  return coalesce(v_count, 0);
end;
$$;

create or replace function public.dismiss_notification(
  p_notification_id uuid
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
    raise exception using
      errcode = '42501',
      message = 'authentication_required';
  end if;

  delete from public.user_notifications
  where id = p_notification_id and user_id = v_user_id;

  return found;
end;
$$;

revoke all on function public.send_friend_request(uuid)
  from public, anon;
revoke all on function public.respond_friend_request(uuid, boolean)
  from public, anon;
revoke all on function public.cancel_friend_request(uuid)
  from public, anon;
revoke all on function public.list_user_notifications(integer)
  from public, anon;
revoke all on function public.get_unread_notification_count()
  from public, anon;
revoke all on function public.mark_notifications_read(uuid[])
  from public, anon;
revoke all on function public.dismiss_notification(uuid)
  from public, anon;

grant execute on function public.send_friend_request(uuid)
  to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean)
  to authenticated;
grant execute on function public.cancel_friend_request(uuid)
  to authenticated;
grant execute on function public.list_user_notifications(integer)
  to authenticated;
grant execute on function public.get_unread_notification_count()
  to authenticated;
grant execute on function public.mark_notifications_read(uuid[])
  to authenticated;
grant execute on function public.dismiss_notification(uuid)
  to authenticated;

select cron.schedule(
  'cleanup-expired-user-notifications',
  '29 3 * * *',
  $$delete from public.user_notifications where expires_at <= now()$$
)
where not exists (
  select 1
  from cron.job
  where jobname = 'cleanup-expired-user-notifications'
);
