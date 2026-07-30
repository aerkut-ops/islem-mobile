-- Keep this filename aligned with the Supabase migration history version.
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint friend_requests_different_users check (sender_id <> receiver_id)
);

create table if not exists public.friendships (
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  constraint friendships_canonical_order check (user_a < user_b)
);

create unique index if not exists friend_requests_pair_unique
  on public.friend_requests (
    least(sender_id, receiver_id),
    greatest(sender_id, receiver_id)
  );

create index if not exists friend_requests_receiver_created_idx
  on public.friend_requests (receiver_id, created_at desc);

create index if not exists friend_requests_sender_created_idx
  on public.friend_requests (sender_id, created_at desc);

create index if not exists friendships_user_b_created_idx
  on public.friendships (user_b, created_at desc);

alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;

revoke all on public.friend_requests from anon, authenticated;
revoke all on public.friendships from anon, authenticated;

drop policy if exists "friend_requests_select_participant"
  on public.friend_requests;
create policy "friend_requests_select_participant"
  on public.friend_requests
  for select
  to authenticated
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists "friendships_select_participant"
  on public.friendships;
create policy "friendships_select_participant"
  on public.friendships
  for select
  to authenticated
  using (auth.uid() = user_a or auth.uid() = user_b);

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
    p.user_id,
    p.username,
    p.display_name,
    case
      when f.user_a is not null then 'friend'
      when r.sender_id = v_user_id then 'outgoing'
      when r.receiver_id = v_user_id then 'incoming'
      else 'none'
    end,
    r.id
  from public.profiles p
  left join public.friendships f
    on f.user_a = least(v_user_id, p.user_id)
    and f.user_b = greatest(v_user_id, p.user_id)
  left join public.friend_requests r
    on (
      r.sender_id = v_user_id
      and r.receiver_id = p.user_id
    )
    or (
      r.sender_id = p.user_id
      and r.receiver_id = v_user_id
    )
  where
    p.user_id <> v_user_id
    and p.username is not null
    and (
      left(p.username, char_length(v_query)) = v_query
      or position(v_query in lower(coalesce(p.display_name, ''))) > 0
    )
  order by
    (p.username = v_query) desc,
    p.username asc
  limit v_limit;
end;
$$;

create or replace function public.list_friend_connections()
returns table (
  connection_type text,
  request_id uuid,
  player_id uuid,
  username text,
  display_name text,
  created_at timestamptz
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
    connections.connection_type,
    connections.request_id,
    connections.player_id,
    connections.username,
    connections.display_name,
    connections.created_at
  from (
    select
      'friend'::text as connection_type,
      null::uuid as request_id,
      p.user_id as player_id,
      p.username,
      p.display_name,
      f.created_at
    from public.friendships f
    join public.profiles p
      on p.user_id = case
        when f.user_a = v_user_id then f.user_b
        else f.user_a
      end
    where f.user_a = v_user_id or f.user_b = v_user_id

    union all

    select
      'incoming'::text,
      r.id,
      p.user_id,
      p.username,
      p.display_name,
      r.created_at
    from public.friend_requests r
    join public.profiles p on p.user_id = r.sender_id
    where r.receiver_id = v_user_id

    union all

    select
      'outgoing'::text,
      r.id,
      p.user_id,
      p.username,
      p.display_name,
      r.created_at
    from public.friend_requests r
    join public.profiles p on p.user_id = r.receiver_id
    where r.sender_id = v_user_id
  ) connections
  order by
    case connections.connection_type
      when 'incoming' then 0
      when 'friend' then 1
      else 2
    end,
    connections.created_at desc;
end;
$$;

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
  values (v_user_id, p_target_user_id);

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
  end if;

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
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  delete from public.friend_requests
  where id = p_request_id and sender_id = v_user_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'friend_request_not_found';
  end if;

  return 'cancelled';
end;
$$;

create or replace function public.remove_friend(
  p_friend_user_id uuid
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

  if p_friend_user_id is null or p_friend_user_id = v_user_id then
    raise exception using errcode = '22023', message = 'invalid_friend_target';
  end if;

  delete from public.friendships
  where
    user_a = least(v_user_id, p_friend_user_id)
    and user_b = greatest(v_user_id, p_friend_user_id);

  return case when found then 'removed' else 'not_friends' end;
end;
$$;

revoke all on function public.search_players(text, integer)
  from public, anon;
revoke all on function public.list_friend_connections()
  from public, anon;
revoke all on function public.send_friend_request(uuid)
  from public, anon;
revoke all on function public.respond_friend_request(uuid, boolean)
  from public, anon;
revoke all on function public.cancel_friend_request(uuid)
  from public, anon;
revoke all on function public.remove_friend(uuid)
  from public, anon;

grant execute on function public.search_players(text, integer)
  to authenticated;
grant execute on function public.list_friend_connections()
  to authenticated;
grant execute on function public.send_friend_request(uuid)
  to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean)
  to authenticated;
grant execute on function public.cancel_friend_request(uuid)
  to authenticated;
grant execute on function public.remove_friend(uuid)
  to authenticated;
