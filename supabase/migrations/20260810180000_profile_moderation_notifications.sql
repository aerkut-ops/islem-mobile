alter table public.user_notifications
  alter column actor_id drop not null;

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
      'challenge_started',
      'moderation_profile_cleared'
    )
  );

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
set search_path = ''
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
    notification.id,
    notification.notification_type,
    notification.actor_id,
    actor.username,
    actor.display_name,
    notification.entity_id,
    notification.read_at is not null,
    notification.created_at
  from public.user_notifications notification
  left join public.profiles actor
    on actor.user_id = notification.actor_id
  where
    notification.user_id = v_user_id
    and notification.expires_at > now()
    and (
      notification.actor_id is null
      or actor.username is not null
    )
  order by notification.created_at desc, notification.id
  limit v_limit;
end;
$$;

create or replace function public.claim_pending_push_notifications(
  p_limit integer default 20
)
returns table (
  notification_id uuid,
  recipient_user_id uuid,
  notification_type text,
  actor_id uuid,
  actor_username text,
  actor_display_name text,
  entity_id uuid,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  return query
  with candidates as (
    select notification.id
    from public.user_notifications notification
    where
      notification.expires_at > now()
      and notification.push_attempt_count < 3
      and (
        notification.push_status = 'pending'
        or (
          notification.push_status = 'processing'
          and notification.push_claimed_at < now() - interval '5 minutes'
        )
      )
    order by notification.created_at, notification.id
    for update skip locked
    limit v_limit
  ),
  claimed as (
    update public.user_notifications notification
    set
      push_status = 'processing',
      push_attempt_count = notification.push_attempt_count + 1,
      push_claimed_at = now(),
      push_last_error = null
    from candidates candidate
    where notification.id = candidate.id
    returning notification.*
  )
  select
    claimed_notification.id,
    claimed_notification.user_id,
    claimed_notification.notification_type,
    claimed_notification.actor_id,
    actor.username,
    actor.display_name,
    claimed_notification.entity_id,
    claimed_notification.push_attempt_count
  from claimed claimed_notification
  left join public.profiles actor
    on actor.user_id = claimed_notification.actor_id
  where
    claimed_notification.actor_id is null
    or actor.username is not null;
end;
$$;

create or replace function public.moderate_player_report(
  p_report_id uuid,
  p_action text,
  p_resolution text default null
)
returns table (
  report_id uuid,
  status text,
  resolution text,
  profile_cleared boolean,
  reviewed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_resolution text := nullif(lower(btrim(coalesce(p_resolution, ''))), '');
  v_report public.player_reports%rowtype;
  v_previous_status text;
  v_next_status text;
  v_profile_cleared boolean := false;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  if not private.is_report_moderator(v_user_id) then
    raise exception using errcode = '42501', message = 'moderator_access_required';
  end if;

  if p_report_id is null then
    raise exception using errcode = '22023', message = 'invalid_report_id';
  end if;

  if v_action not in ('review', 'resolve', 'dismiss') then
    raise exception using errcode = '22023', message = 'invalid_moderation_action';
  end if;

  select *
  into v_report
  from public.player_reports report
  where report.id = p_report_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'report_not_found';
  end if;

  if v_report.status in ('resolved', 'dismissed') then
    raise exception using errcode = '22023', message = 'report_already_closed';
  end if;

  v_previous_status := v_report.status;

  if v_action = 'review' then
    if v_report.status <> 'pending' or v_resolution is not null then
      raise exception using errcode = '22023', message = 'invalid_moderation_transition';
    end if;
    v_next_status := 'reviewing';
  elsif v_action = 'resolve' then
    if
      v_report.status <> 'reviewing'
      or v_resolution is null
      or v_resolution not in ('profile_cleared', 'handled_externally')
    then
      raise exception using errcode = '22023', message = 'invalid_moderation_resolution';
    end if;
    v_next_status := 'resolved';
  else
    if
      v_report.status <> 'reviewing'
      or v_resolution is null
      or v_resolution not in ('no_violation', 'duplicate')
    then
      raise exception using errcode = '22023', message = 'invalid_moderation_resolution';
    end if;
    v_next_status := 'dismissed';
  end if;

  if v_resolution = 'profile_cleared' then
    update public.profiles
    set
      username = null,
      display_name = null,
      updated_at = now()
    where user_id = v_report.reported_id;
    v_profile_cleared := found;
  end if;

  update public.player_reports
  set
    status = v_next_status,
    reviewed_at = case
      when v_next_status in ('resolved', 'dismissed') then now()
      else null
    end,
    resolution = v_resolution
  where id = v_report.id
  returning * into v_report;

  insert into private.player_report_actions (
    report_id,
    moderator_id,
    action,
    previous_status,
    next_status,
    resolution
  )
  values (
    v_report.id,
    v_user_id,
    v_action,
    v_previous_status,
    v_next_status,
    v_resolution
  );

  if v_resolution = 'profile_cleared' and v_profile_cleared then
    insert into public.user_notifications (
      user_id,
      actor_id,
      notification_type,
      entity_id,
      expires_at
    )
    values (
      v_report.reported_id,
      null,
      'moderation_profile_cleared',
      v_report.id,
      now() + interval '30 days'
    )
    on conflict (user_id, notification_type, entity_id) do nothing;
  end if;

  return query
  select
    v_report.id,
    v_report.status,
    v_report.resolution,
    v_profile_cleared,
    v_report.reviewed_at;
end;
$$;

revoke all on function public.list_user_notifications(integer)
  from public, anon;
revoke all on function public.claim_pending_push_notifications(integer)
  from public, anon, authenticated;
revoke all on function public.moderate_player_report(uuid, text, text)
  from public, anon;

grant execute on function public.list_user_notifications(integer)
  to authenticated;
grant execute on function public.claim_pending_push_notifications(integer)
  to service_role;
grant execute on function public.moderate_player_report(uuid, text, text)
  to authenticated;
