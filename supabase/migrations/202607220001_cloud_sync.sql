create extension if not exists pgcrypto;
create extension if not exists pg_cron;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  avatar_key text,
  locale text not null default 'tr',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_length check (username is null or char_length(username) between 3 and 24),
  constraint profiles_display_name_length check (display_name is null or char_length(display_name) <= 40)
);

create table if not exists public.player_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_score integer not null default 0,
  best_score integer not null default 0,
  games_played integer not null default 0,
  games_completed integer not null default 0,
  perfect_games integer not null default 0,
  targets_solved integer not null default 0,
  total_moves integer not null default 0,
  current_streak integer not null default 0,
  best_streak integer not null default 0,
  last_streak_date date,
  daily_completed_count integer not null default 0,
  weekly_completed_count integer not null default 0,
  last_played_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  completed boolean not null default false,
  streak_awarded boolean not null default false,
  first_completed_at timestamptz,
  source_mode text,
  daily_challenge_key text,
  daily_challenge_completed boolean not null default false,
  daily_score_awarded integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

create table if not exists public.weekly_scores (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_key text not null,
  score integer not null default 0,
  games_played integer not null default 0,
  targets_solved integer not null default 0,
  best_single_score integer not null default 0,
  league_key text,
  rank_snapshot integer,
  weekly_challenge_key text,
  weekly_challenge_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, week_key)
);

create table if not exists public.monthly_scores (
  user_id uuid not null references auth.users(id) on delete cascade,
  month_key text not null,
  score integer not null default 0,
  games_played integer not null default 0,
  targets_solved integer not null default 0,
  best_single_score integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, month_key),
  constraint monthly_scores_month_key_format check (month_key ~ '^[0-9]{4}-[0-9]{2}$')
);

create table if not exists public.score_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_result_id text not null,
  mode text not null,
  difficulty text not null,
  score integer not null,
  awarded_score integer not null,
  targets_solved integer not null,
  target_count integer not null,
  operation_count integer not null,
  duration_seconds integer not null,
  hint_used_count integer not null default 0,
  puzzle_key text,
  completed boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  played_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '90 days',
  unique (user_id, client_result_id),
  constraint score_events_client_result_id_length check (char_length(client_result_id) between 8 and 100),
  constraint score_events_puzzle_key_length check (puzzle_key is null or char_length(puzzle_key) <= 120),
  constraint score_events_mode_check check (mode in ('normal', 'daily', 'weekly')),
  constraint score_events_difficulty_check check (difficulty in ('paper', 'easy', 'medium', 'hard', 'master', 'weekly')),
  constraint score_events_counts_check check (
    targets_solved >= 0
    and target_count >= 0
    and targets_solved <= target_count
    and operation_count >= 0
    and duration_seconds >= 0
    and hint_used_count >= 0
  )
);

create table if not exists public.achievement_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_key text not null,
  source_event_id uuid references public.score_events(id) on delete set null,
  unlocked_at timestamptz not null default now(),
  unique (user_id, achievement_key)
);

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  status text not null default 'requested',
  completed_at timestamptz,
  reason_optional text,
  constraint account_deletion_requests_status_check check (status in ('requested', 'processing', 'completed', 'cancelled'))
);

create index if not exists score_events_user_played_idx on public.score_events (user_id, played_at desc);
create index if not exists score_events_expires_idx on public.score_events (expires_at);
create index if not exists weekly_scores_week_score_idx on public.weekly_scores (week_key, score desc);
create index if not exists monthly_scores_month_score_idx on public.monthly_scores (month_key, score desc);
create index if not exists achievement_unlocks_user_idx on public.achievement_unlocks (user_id, unlocked_at desc);

alter table public.profiles enable row level security;
alter table public.player_stats enable row level security;
alter table public.daily_progress enable row level security;
alter table public.weekly_scores enable row level security;
alter table public.monthly_scores enable row level security;
alter table public.score_events enable row level security;
alter table public.achievement_unlocks enable row level security;
alter table public.account_deletion_requests enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select on public.player_stats to authenticated;
grant select on public.daily_progress to authenticated;
grant select on public.weekly_scores to authenticated;
grant select on public.monthly_scores to authenticated;
grant select on public.score_events to authenticated;
grant select on public.achievement_unlocks to authenticated;
grant select, insert on public.account_deletion_requests to authenticated;

create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "player_stats_select_own"
  on public.player_stats
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "daily_progress_select_own"
  on public.daily_progress
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "weekly_scores_select"
  on public.weekly_scores
  for select
  to authenticated
  using (true);

create policy "monthly_scores_select"
  on public.monthly_scores
  for select
  to authenticated
  using (true);

create policy "score_events_select_own"
  on public.score_events
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "achievement_unlocks_select_own"
  on public.achievement_unlocks
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "account_deletion_requests_select_own"
  on public.account_deletion_requests
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "account_deletion_requests_insert_own"
  on public.account_deletion_requests
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name, locale)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', null), 'tr')
  on conflict (user_id) do nothing;

  insert into public.player_stats (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke all on function public.handle_new_user() from public, anon, authenticated;

create or replace function public.get_week_key(p_date date default current_date)
returns text
language sql
stable
as $$
  select to_char(date_trunc('week', p_date::timestamp), 'YYYY-MM-DD');
$$;

create or replace function public.get_month_key(p_date date default current_date)
returns text
language sql
stable
as $$
  select to_char(p_date, 'YYYY-MM');
$$;

revoke all on function public.get_week_key(date) from public, anon, authenticated;
revoke all on function public.get_month_key(date) from public, anon, authenticated;

create or replace function public.award_achievement(
  p_user_id uuid,
  p_achievement_key text,
  p_source_event_id uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.achievement_unlocks (user_id, achievement_key, source_event_id)
  values (p_user_id, p_achievement_key, p_source_event_id)
  on conflict (user_id, achievement_key) do nothing;
$$;

revoke all on function public.award_achievement(uuid, text, uuid) from public, anon, authenticated;

create or replace function public.submit_game_result(p_result jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_client_result_id text := nullif(p_result->>'client_result_id', '');
  v_mode text := coalesce(nullif(p_result->>'mode', ''), 'normal');
  v_difficulty text := coalesce(nullif(p_result->>'difficulty', ''), 'easy');
  v_targets_solved integer := greatest(0, coalesce((p_result->>'targets_solved')::integer, 0));
  v_target_count integer := greatest(0, coalesce((p_result->>'target_count')::integer, 0));
  v_operation_count integer := greatest(0, coalesce((p_result->>'operation_count')::integer, 0));
  v_duration_seconds integer := greatest(0, coalesce((p_result->>'duration_seconds')::integer, 0));
  v_hint_used_count integer := greatest(0, coalesce((p_result->>'hint_used_count')::integer, 0));
  v_par integer := greatest(0, least(250, coalesce((p_result->>'par')::integer, 0)));
  v_puzzle_key text := nullif(p_result->>'puzzle_key', '');
  v_completed boolean := coalesce((p_result->>'completed')::boolean, false);
  v_client_finished_at timestamptz := coalesce((p_result->>'client_finished_at')::timestamptz, now());
  v_client_utc_offset_minutes integer := coalesce((p_result->>'client_utc_offset_minutes')::integer, 0);
  v_score integer;
  v_awarded_score integer;
  v_event_id uuid;
  v_event_date date;
  v_week_key text;
  v_month_key text;
  v_daily_row public.daily_progress%rowtype;
  v_weekly_row public.weekly_scores%rowtype;
  v_stats public.player_stats%rowtype;
  v_streak_awarded boolean := false;
  v_daily_bonus_awarded boolean := false;
  v_weekly_challenge_awarded boolean := false;
  v_current_streak integer := 0;
  v_best_observed_streak integer := 0;
  v_last_streak_date date;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if v_client_result_id is null then
    raise exception 'client_result_id is required';
  end if;

  if char_length(v_client_result_id) not between 8 and 100 then
    raise exception 'Invalid client_result_id length';
  end if;

  if v_puzzle_key is not null and char_length(v_puzzle_key) > 120 then
    raise exception 'Invalid puzzle_key length';
  end if;

  if pg_column_size(p_result) > 16384 then
    raise exception 'Game result payload is too large';
  end if;

  if v_mode not in ('normal', 'daily', 'weekly') then
    raise exception 'Invalid mode: %', v_mode;
  end if;

  if v_difficulty not in ('paper', 'easy', 'medium', 'hard', 'master', 'weekly') then
    raise exception 'Invalid difficulty: %', v_difficulty;
  end if;

  if (v_mode = 'weekly') <> (v_difficulty = 'weekly') then
    raise exception 'Weekly mode and difficulty must be used together';
  end if;

  if v_mode = 'daily' and v_difficulty not in ('easy', 'medium', 'hard', 'master') then
    raise exception 'Invalid daily difficulty: %', v_difficulty;
  end if;

  if
    (v_difficulty in ('paper', 'easy') and v_target_count <> 3)
    or (v_difficulty = 'medium' and v_target_count <> 4)
    or (v_difficulty = 'hard' and v_target_count <> 5)
    or (v_difficulty = 'master' and v_target_count not between 8 and 10)
    or (v_difficulty = 'weekly' and v_target_count not between 9 and 10)
  then
    raise exception 'Invalid target count for difficulty: %', v_difficulty;
  end if;

  if v_targets_solved > v_target_count then
    raise exception 'targets_solved cannot exceed target_count';
  end if;

  if v_operation_count < v_targets_solved then
    raise exception 'operation_count cannot be lower than targets_solved';
  end if;

  if v_completed and v_targets_solved <> v_target_count then
    raise exception 'Completed games must solve every target';
  end if;

  if v_operation_count > 250 or v_duration_seconds > 86400 or v_hint_used_count > 100 then
    raise exception 'Game result is outside accepted limits';
  end if;

  if v_client_utc_offset_minutes not between -840 and 840 then
    raise exception 'Invalid UTC offset';
  end if;

  if v_client_finished_at > now() + interval '1 hour'
    or v_client_finished_at < now() - interval '90 days'
  then
    raise exception 'client_finished_at is outside accepted limits';
  end if;

  v_event_date := (v_client_finished_at + make_interval(mins => v_client_utc_offset_minutes))::date;
  v_week_key := public.get_week_key(v_event_date);
  v_month_key := public.get_month_key(v_event_date);

  insert into public.player_stats (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select *
  into strict v_stats
  from public.player_stats
  where user_id = v_user_id
  for update;

  if exists (
    select 1
    from public.score_events
    where user_id = v_user_id and client_result_id = v_client_result_id
  ) then
    return jsonb_build_object('status', 'duplicate');
  end if;

  v_score := greatest(0, v_targets_solved * 30 - v_operation_count * 2);
  v_awarded_score := case when v_completed then v_score else 0 end;

  if v_completed and v_difficulty <> 'paper' then
    insert into public.daily_progress (
      user_id,
      date,
      completed,
      streak_awarded,
      first_completed_at,
      source_mode
    )
    values (
      v_user_id,
      v_event_date,
      true,
      true,
      now(),
      v_mode
    )
    on conflict (user_id, date) do nothing
    returning * into v_daily_row;

    if found then
      v_streak_awarded := true;

      with ordered_dates as (
        select
          date,
          date - row_number() over (order by date)::integer as streak_group
        from public.daily_progress
        where user_id = v_user_id and streak_awarded = true
      ), streaks as (
        select max(date) as end_date, count(*)::integer as length
        from ordered_dates
        group by streak_group
      )
      select
        coalesce((select length from streaks order by end_date desc limit 1), 0),
        coalesce((select max(length) from streaks), 0),
        (select max(end_date) from streaks)
      into v_current_streak, v_best_observed_streak, v_last_streak_date;

      update public.player_stats
      set
        current_streak = v_current_streak,
        best_streak = greatest(best_streak, v_best_observed_streak),
        last_streak_date = v_last_streak_date,
        updated_at = now()
      where user_id = v_user_id
      returning * into v_stats;
    end if;
  end if;

  if v_mode = 'daily' and v_puzzle_key is not null and v_completed then
    insert into public.daily_progress (
      user_id,
      date,
      completed,
      first_completed_at,
      source_mode,
      daily_challenge_key,
      daily_challenge_completed,
      daily_score_awarded
    )
    values (
      v_user_id,
      v_event_date,
      true,
      now(),
      v_mode,
      v_puzzle_key,
      true,
      round(v_score * 1.5)::integer
    )
    on conflict (user_id, date) do update
      set
        daily_challenge_key = case
          when public.daily_progress.daily_challenge_completed then public.daily_progress.daily_challenge_key
          else excluded.daily_challenge_key
        end,
        daily_challenge_completed = true,
        daily_score_awarded = case
          when public.daily_progress.daily_challenge_completed then public.daily_progress.daily_score_awarded
          else excluded.daily_score_awarded
        end,
        updated_at = now()
      where public.daily_progress.daily_challenge_completed = false
    returning * into v_daily_row;

    if found and v_daily_row.daily_score_awarded > 0 and v_daily_row.daily_challenge_key = v_puzzle_key then
      v_awarded_score := v_daily_row.daily_score_awarded;
      v_daily_bonus_awarded := true;
    else
      v_awarded_score := 0;
    end if;
  end if;

  insert into public.weekly_scores (user_id, week_key)
  values (v_user_id, v_week_key)
  on conflict (user_id, week_key) do nothing;

  select *
  into v_weekly_row
  from public.weekly_scores
  where user_id = v_user_id and week_key = v_week_key
  for update;

  if v_mode = 'weekly' and v_puzzle_key is not null and v_completed then
    if v_weekly_row.weekly_challenge_completed then
      v_awarded_score := 0;
    else
      v_weekly_challenge_awarded := true;
      update public.weekly_scores
      set
        weekly_challenge_key = v_puzzle_key,
        weekly_challenge_completed = true,
        updated_at = now()
      where user_id = v_user_id and week_key = v_week_key;
    end if;
  end if;

  insert into public.score_events (
    user_id,
    client_result_id,
    mode,
    difficulty,
    score,
    awarded_score,
    targets_solved,
    target_count,
    operation_count,
    duration_seconds,
    hint_used_count,
    puzzle_key,
    completed,
    payload,
    played_at,
    expires_at
  )
  values (
    v_user_id,
    v_client_result_id,
    v_mode,
    v_difficulty,
    v_score,
    v_awarded_score,
    v_targets_solved,
    v_target_count,
    v_operation_count,
    v_duration_seconds,
    v_hint_used_count,
    v_puzzle_key,
    v_completed,
    p_result,
    v_client_finished_at,
    v_client_finished_at + interval '90 days'
  )
  on conflict (user_id, client_result_id) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return jsonb_build_object('status', 'duplicate');
  end if;

  update public.player_stats
  set
    total_score = total_score + v_awarded_score,
    best_score = greatest(best_score, v_awarded_score),
    games_played = games_played + 1,
    games_completed = games_completed + case when v_completed then 1 else 0 end,
    perfect_games = perfect_games + case
      when v_completed and v_par > 0 and v_operation_count <= v_par then 1
      else 0
    end,
    targets_solved = targets_solved + v_targets_solved,
    total_moves = total_moves + v_operation_count,
    daily_completed_count = daily_completed_count + case when v_daily_bonus_awarded then 1 else 0 end,
    weekly_completed_count = weekly_completed_count + case when v_weekly_challenge_awarded then 1 else 0 end,
    last_played_at = now(),
    updated_at = now()
  where user_id = v_user_id
  returning * into v_stats;

  update public.weekly_scores
  set
    score = score + v_awarded_score,
    games_played = games_played + 1,
    targets_solved = targets_solved + v_targets_solved,
    best_single_score = greatest(best_single_score, v_awarded_score),
    updated_at = now()
  where user_id = v_user_id and week_key = v_week_key;

  insert into public.monthly_scores (
    user_id,
    month_key,
    score,
    games_played,
    targets_solved,
    best_single_score
  )
  values (
    v_user_id,
    v_month_key,
    v_awarded_score,
    1,
    v_targets_solved,
    v_awarded_score
  )
  on conflict (user_id, month_key) do update
  set
    score = public.monthly_scores.score + excluded.score,
    games_played = public.monthly_scores.games_played + 1,
    targets_solved = public.monthly_scores.targets_solved + excluded.targets_solved,
    best_single_score = greatest(public.monthly_scores.best_single_score, excluded.best_single_score),
    updated_at = now();

  if v_completed then
    perform public.award_achievement(v_user_id, 'first_win', v_event_id);
  end if;

  if v_daily_bonus_awarded then
    perform public.award_achievement(v_user_id, 'daily_first', v_event_id);
  end if;

  if v_weekly_challenge_awarded then
    perform public.award_achievement(v_user_id, 'weekly_first', v_event_id);
  end if;

  if v_stats.best_streak >= 3 then
    perform public.award_achievement(v_user_id, 'streak_3', v_event_id);
  end if;

  if v_stats.best_streak >= 7 then
    perform public.award_achievement(v_user_id, 'streak_7', v_event_id);
  end if;

  if v_stats.best_streak >= 14 then
    perform public.award_achievement(v_user_id, 'streak_14', v_event_id);
  end if;

  if v_stats.games_completed >= 5 then
    perform public.award_achievement(v_user_id, 'games_5', v_event_id);
  end if;

  if v_stats.games_completed >= 20 then
    perform public.award_achievement(v_user_id, 'games_20', v_event_id);
  end if;

  if v_stats.perfect_games >= 1 then
    perform public.award_achievement(v_user_id, 'perfect', v_event_id);
  end if;

  if v_stats.targets_solved >= 50 then
    perform public.award_achievement(v_user_id, 'targets_50', v_event_id);
  end if;

  if v_stats.total_score >= 1000 then
    perform public.award_achievement(v_user_id, 'score_1000', v_event_id);
  end if;

  if v_stats.total_score >= 5000 then
    perform public.award_achievement(v_user_id, 'score_5000', v_event_id);
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'event_id', v_event_id,
    'score', v_score,
    'awarded_score', v_awarded_score,
    'streak_awarded', v_streak_awarded,
    'daily_bonus_awarded', v_daily_bonus_awarded,
    'weekly_challenge_awarded', v_weekly_challenge_awarded,
    'week_key', v_week_key,
    'month_key', v_month_key
  );
end;
$$;

revoke all on function public.submit_game_result(jsonb) from public;
grant execute on function public.submit_game_result(jsonb) to authenticated;

select cron.schedule(
  'cleanup-expired-score-events',
  '17 3 * * *',
  $$delete from public.score_events where expires_at <= now()$$
);
