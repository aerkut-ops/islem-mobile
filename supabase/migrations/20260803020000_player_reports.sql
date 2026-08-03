create table if not exists public.player_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_id uuid not null references auth.users(id) on delete cascade,
  reported_username_snapshot text not null,
  reported_display_name_snapshot text,
  reason text not null,
  status text not null default 'pending',
  report_date date not null default (timezone('utc', now()))::date,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  resolution text,
  expires_at timestamptz not null default now() + interval '365 days',
  constraint player_reports_different_users check (reporter_id <> reported_id),
  constraint player_reports_reason_check check (
    reason in (
      'inappropriate_profile',
      'harassment',
      'spam_cheating',
      'other'
    )
  ),
  constraint player_reports_status_check check (
    status in ('pending', 'reviewing', 'resolved', 'dismissed')
  ),
  constraint player_reports_expiry_check check (expires_at > created_at),
  constraint player_reports_daily_reason_unique unique (
    reporter_id,
    reported_id,
    reason,
    report_date
  )
);

create index if not exists player_reports_status_created_idx
  on public.player_reports (status, created_at);

create index if not exists player_reports_expires_idx
  on public.player_reports (expires_at);

alter table public.player_reports enable row level security;
revoke all on public.player_reports from public, anon, authenticated;

create or replace function public.report_player(
  p_target_user_id uuid,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_reason text := lower(btrim(coalesce(p_reason, '')));
  v_report_date date := (timezone('utc', now()))::date;
  v_daily_count integer;
  v_profile public.profiles%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  if p_target_user_id is null or p_target_user_id = v_user_id then
    raise exception using errcode = '22023', message = 'invalid_report_target';
  end if;

  if v_reason not in (
    'inappropriate_profile',
    'harassment',
    'spam_cheating',
    'other'
  ) then
    raise exception using errcode = '22023', message = 'invalid_report_reason';
  end if;

  select *
  into v_profile
  from public.profiles
  where user_id = p_target_user_id and username is not null;

  if not found then
    raise exception using errcode = 'P0002', message = 'player_not_found';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'player-report:' || v_user_id::text || ':' || v_report_date::text,
      0
    )
  );

  if exists (
    select 1
    from public.player_reports report
    where
      report.reporter_id = v_user_id
      and report.reported_id = p_target_user_id
      and report.reason = v_reason
      and report.report_date = v_report_date
  ) then
    return 'already_reported';
  end if;

  select count(*)::integer
  into v_daily_count
  from public.player_reports report
  where
    report.reporter_id = v_user_id
    and report.report_date = v_report_date;

  if v_daily_count >= 10 then
    raise exception using errcode = '54000', message = 'report_rate_limited';
  end if;

  insert into public.player_reports (
    reporter_id,
    reported_id,
    reported_username_snapshot,
    reported_display_name_snapshot,
    reason,
    report_date
  )
  values (
    v_user_id,
    p_target_user_id,
    v_profile.username,
    v_profile.display_name,
    v_reason,
    v_report_date
  );

  return 'reported';
end;
$$;

revoke all on function public.report_player(uuid, text) from public, anon;
grant execute on function public.report_player(uuid, text) to authenticated;

select cron.schedule(
  'cleanup-expired-player-reports',
  '41 3 * * *',
  $$delete from public.player_reports where expires_at <= now()$$
)
where not exists (
  select 1
  from cron.job
  where jobname = 'cleanup-expired-player-reports'
);
