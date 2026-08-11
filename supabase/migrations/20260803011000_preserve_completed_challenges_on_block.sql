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

revoke all on function public.block_player(uuid) from public, anon;
grant execute on function public.block_player(uuid) to authenticated;
