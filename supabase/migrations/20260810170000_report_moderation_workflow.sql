create table if not exists private.report_moderators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'moderator',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint report_moderators_role_check check (
    role in ('moderator', 'owner')
  )
);

alter table private.report_moderators enable row level security;
revoke all on private.report_moderators
  from public, anon, authenticated, service_role;

create table if not exists private.player_report_actions (
  id bigint generated always as identity primary key,
  report_id uuid not null references public.player_reports(id) on delete cascade,
  moderator_id uuid references auth.users(id) on delete set null,
  action text not null,
  previous_status text not null,
  next_status text not null,
  resolution text,
  created_at timestamptz not null default now(),
  constraint player_report_actions_action_check check (
    action in ('review', 'resolve', 'dismiss')
  ),
  constraint player_report_actions_previous_status_check check (
    previous_status in ('pending', 'reviewing', 'resolved', 'dismissed')
  ),
  constraint player_report_actions_next_status_check check (
    next_status in ('reviewing', 'resolved', 'dismissed')
  ),
  constraint player_report_actions_resolution_check check (
    resolution is null
    or resolution in (
      'profile_cleared',
      'handled_externally',
      'no_violation',
      'duplicate'
    )
  )
);

create index if not exists player_report_actions_report_created_idx
  on private.player_report_actions (report_id, created_at);

alter table private.player_report_actions enable row level security;
revoke all on private.player_report_actions
  from public, anon, authenticated, service_role;

create or replace function private.is_report_moderator(
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.report_moderators moderator
    where moderator.user_id = p_user_id
  );
$$;

revoke all on function private.is_report_moderator(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.get_report_moderator_access()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select moderator.role
  into v_role
  from private.report_moderators moderator
  where moderator.user_id = v_user_id;

  return v_role;
end;
$$;

revoke all on function public.get_report_moderator_access()
  from public, anon;
grant execute on function public.get_report_moderator_access()
  to authenticated;

create or replace function public.list_player_reports(
  p_status text default 'pending',
  p_limit integer default 50
)
returns table (
  report_id uuid,
  reported_player_id uuid,
  username_snapshot text,
  display_name_snapshot text,
  reason text,
  status text,
  related_open_reports bigint,
  created_at timestamptz,
  reviewed_at timestamptz,
  resolution text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status text := lower(btrim(coalesce(p_status, 'pending')));
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  if not private.is_report_moderator(v_user_id) then
    raise exception using errcode = '42501', message = 'moderator_access_required';
  end if;

  if v_status not in ('pending', 'reviewing', 'resolved', 'dismissed') then
    raise exception using errcode = '22023', message = 'invalid_report_status';
  end if;

  return query
  select
    report.id,
    report.reported_id,
    report.reported_username_snapshot,
    report.reported_display_name_snapshot,
    report.reason,
    report.status,
    (
      select count(*)
      from public.player_reports related
      where
        related.reported_id = report.reported_id
        and related.status in ('pending', 'reviewing')
    ),
    report.created_at,
    report.reviewed_at,
    report.resolution
  from public.player_reports report
  where report.status = v_status
  order by report.created_at asc, report.id asc
  limit v_limit;
end;
$$;

revoke all on function public.list_player_reports(text, integer)
  from public, anon;
grant execute on function public.list_player_reports(text, integer)
  to authenticated;

create or replace function public.list_player_report_actions(
  p_report_id uuid
)
returns table (
  action_id bigint,
  action text,
  previous_status text,
  next_status text,
  resolution text,
  moderator_role text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
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

  return query
  select
    report_action.id,
    report_action.action,
    report_action.previous_status,
    report_action.next_status,
    report_action.resolution,
    coalesce(moderator.role, 'former_moderator'),
    report_action.created_at
  from private.player_report_actions report_action
  left join private.report_moderators moderator
    on moderator.user_id = report_action.moderator_id
  where report_action.report_id = p_report_id
  order by report_action.created_at asc, report_action.id asc;
end;
$$;

revoke all on function public.list_player_report_actions(uuid)
  from public, anon;
grant execute on function public.list_player_report_actions(uuid)
  to authenticated;

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
      v_resolution is null
      or v_resolution not in ('profile_cleared', 'handled_externally')
    then
      raise exception using errcode = '22023', message = 'invalid_moderation_resolution';
    end if;
    v_next_status := 'resolved';
  else
    if
      v_resolution is null
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

  return query
  select
    v_report.id,
    v_report.status,
    v_report.resolution,
    v_profile_cleared,
    v_report.reviewed_at;
end;
$$;

revoke all on function public.moderate_player_report(uuid, text, text)
  from public, anon;
grant execute on function public.moderate_player_report(uuid, text, text)
  to authenticated;

create or replace function public.set_report_moderator(
  p_user_id uuid,
  p_role text default 'moderator',
  p_enabled boolean default true
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := lower(btrim(coalesce(p_role, 'moderator')));
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;

  if p_user_id is null or not exists (
    select 1 from auth.users account where account.id = p_user_id
  ) then
    raise exception using errcode = 'P0002', message = 'account_not_found';
  end if;

  if v_role not in ('moderator', 'owner') then
    raise exception using errcode = '22023', message = 'invalid_moderator_role';
  end if;

  if p_enabled then
    insert into private.report_moderators (
      user_id,
      role
    )
    values (
      p_user_id,
      v_role
    )
    on conflict (user_id) do update
      set role = excluded.role;
    return v_role;
  end if;

  delete from private.report_moderators
  where user_id = p_user_id;
  return 'disabled';
end;
$$;

revoke all on function public.set_report_moderator(uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.set_report_moderator(uuid, text, boolean)
  to service_role;
