create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null,
  locale text not null default 'en',
  project_id uuid not null,
  application_id text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint push_devices_token_length check (
    char_length(expo_push_token) between 20 and 255
  ),
  constraint push_devices_platform_check check (
    platform in ('ios', 'android')
  ),
  constraint push_devices_locale_check check (
    locale in ('tr', 'en')
  ),
  constraint push_devices_application_id_length check (
    application_id is null or char_length(application_id) <= 120
  )
);

alter table public.user_notifications
  add column if not exists push_status text not null default 'pending',
  add column if not exists push_attempt_count integer not null default 0,
  add column if not exists push_claimed_at timestamptz,
  add column if not exists push_sent_at timestamptz,
  add column if not exists push_last_error text;

alter table public.user_notifications
  drop constraint if exists user_notifications_push_status_check;
alter table public.user_notifications
  add constraint user_notifications_push_status_check check (
    push_status in (
      'pending',
      'processing',
      'sent',
      'no_devices',
      'failed'
    )
  );

alter table public.user_notifications
  drop constraint if exists user_notifications_push_attempt_count_check;
alter table public.user_notifications
  add constraint user_notifications_push_attempt_count_check check (
    push_attempt_count between 0 and 3
  );

create table if not exists public.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null
    references public.user_notifications(id) on delete cascade,
  push_device_id uuid not null
    references public.push_devices(id) on delete cascade,
  expo_ticket_id text,
  status text not null,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  receipt_checked_at timestamptz,
  constraint push_deliveries_status_check check (
    status in ('ticketed', 'delivered', 'failed')
  ),
  constraint push_deliveries_ticket_length check (
    expo_ticket_id is null or char_length(expo_ticket_id) <= 120
  ),
  constraint push_deliveries_error_code_length check (
    error_code is null or char_length(error_code) <= 80
  ),
  constraint push_deliveries_error_message_length check (
    error_message is null or char_length(error_message) <= 500
  ),
  unique (notification_id, push_device_id)
);

create index if not exists push_devices_user_enabled_idx
  on public.push_devices (user_id, enabled, last_seen_at desc);

create index if not exists user_notifications_push_pending_idx
  on public.user_notifications (push_status, created_at)
  where push_status in ('pending', 'processing');

create index if not exists push_deliveries_receipt_idx
  on public.push_deliveries (status, created_at)
  where status = 'ticketed' and receipt_checked_at is null;

alter table public.push_devices enable row level security;
alter table public.push_deliveries enable row level security;

revoke all on public.push_devices from public, anon, authenticated;
revoke all on public.push_deliveries from public, anon, authenticated;
grant select, insert, update, delete on public.push_devices to service_role;
grant select, insert, update, delete on public.push_deliveries to service_role;
grant select, update on public.user_notifications to service_role;

create or replace function public.register_push_device(
  p_expo_push_token text,
  p_platform text,
  p_locale text,
  p_project_id uuid,
  p_application_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_token text := btrim(coalesce(p_expo_push_token, ''));
  v_locale text := case when lower(p_locale) = 'tr' then 'tr' else 'en' end;
  v_device_id uuid;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'authentication_required';
  end if;

  if
    v_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$'
    or char_length(v_token) > 255
  then
    raise exception using
      errcode = '22023',
      message = 'invalid_expo_push_token';
  end if;

  if p_platform not in ('ios', 'android') then
    raise exception using
      errcode = '22023',
      message = 'invalid_push_platform';
  end if;

  if p_project_id <> '0c09f907-48f9-405c-bc54-877f165297a3'::uuid then
    raise exception using
      errcode = '22023',
      message = 'invalid_push_project';
  end if;

  if char_length(coalesce(p_application_id, '')) > 120 then
    raise exception using
      errcode = '22023',
      message = 'invalid_application_id';
  end if;

  insert into public.push_devices (
    user_id,
    expo_push_token,
    platform,
    locale,
    project_id,
    application_id,
    enabled,
    updated_at,
    last_seen_at
  )
  values (
    v_user_id,
    v_token,
    p_platform,
    v_locale,
    p_project_id,
    nullif(btrim(coalesce(p_application_id, '')), ''),
    true,
    now(),
    now()
  )
  on conflict (expo_push_token) do update
  set
    user_id = v_user_id,
    platform = excluded.platform,
    locale = excluded.locale,
    project_id = excluded.project_id,
    application_id = excluded.application_id,
    enabled = true,
    updated_at = now(),
    last_seen_at = now()
  where
    push_devices.user_id = v_user_id
    or push_devices.enabled = false
  returning id into v_device_id;

  if v_device_id is null then
    return false;
  end if;

  update public.push_devices
  set enabled = false, updated_at = now()
  where id in (
    select id
    from public.push_devices
    where user_id = v_user_id and enabled = true
    order by last_seen_at desc, id
    offset 5
  );

  return true;
end;
$$;

create or replace function public.unregister_push_device(
  p_expo_push_token text
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

  update public.push_devices
  set enabled = false, updated_at = now()
  where
    user_id = v_user_id
    and expo_push_token = btrim(coalesce(p_expo_push_token, ''))
    and enabled = true;

  return found;
end;
$$;

create or replace function public.is_push_device_registered(
  p_expo_push_token text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and exists (
      select 1
      from public.push_devices
      where
        user_id = auth.uid()
        and expo_push_token = btrim(coalesce(p_expo_push_token, ''))
        and enabled = true
    );
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
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  return query
  with candidates as (
    select n.id
    from public.user_notifications n
    where
      n.expires_at > now()
      and n.push_attempt_count < 3
      and (
        n.push_status = 'pending'
        or (
          n.push_status = 'processing'
          and n.push_claimed_at < now() - interval '5 minutes'
        )
      )
    order by n.created_at, n.id
    for update skip locked
    limit v_limit
  ),
  claimed as (
    update public.user_notifications n
    set
      push_status = 'processing',
      push_attempt_count = n.push_attempt_count + 1,
      push_claimed_at = now(),
      push_last_error = null
    from candidates c
    where n.id = c.id
    returning n.*
  )
  select
    c.id,
    c.user_id,
    c.notification_type,
    c.actor_id,
    p.username,
    p.display_name,
    c.entity_id,
    c.push_attempt_count
  from claimed c
  join public.profiles p on p.user_id = c.actor_id
  where p.username is not null;
end;
$$;

create or replace function public.verify_push_worker_secret(
  p_secret text
)
returns boolean
language sql
stable
security definer
set search_path = public, vault
as $$
  select
    p_secret is not null
    and exists (
      select 1
      from vault.decrypted_secrets
      where
        name = 'islem_push_worker_secret'
        and decrypted_secret = p_secret
    );
$$;

revoke all on function public.register_push_device(text, text, text, uuid, text)
  from public, anon;
revoke all on function public.unregister_push_device(text)
  from public, anon;
revoke all on function public.is_push_device_registered(text)
  from public, anon;
revoke all on function public.claim_pending_push_notifications(integer)
  from public, anon, authenticated;
revoke all on function public.verify_push_worker_secret(text)
  from public, anon, authenticated;

grant execute on function public.register_push_device(text, text, text, uuid, text)
  to authenticated;
grant execute on function public.unregister_push_device(text)
  to authenticated;
grant execute on function public.is_push_device_registered(text)
  to authenticated;
grant execute on function public.claim_pending_push_notifications(integer)
  to service_role;
grant execute on function public.verify_push_worker_secret(text)
  to service_role;

select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'islem_push_worker_secret',
  'Shared secret for the scheduled İşlem push worker.'
)
where not exists (
  select 1 from vault.secrets where name = 'islem_push_worker_secret'
);

select vault.create_secret(
  'https://xuggavmtqgsxazbccfxj.supabase.co',
  'islem_project_url',
  'İşlem production Supabase URL.'
)
where not exists (
  select 1 from vault.secrets where name = 'islem_project_url'
);

select cron.schedule(
  'process-push-notifications',
  '* * * * *',
  $job$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'islem_project_url'
      ) || '/functions/v1/push-worker',
      headers := jsonb_build_object(
        'Content-Type',
        'application/json',
        'x-push-secret',
        (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'islem_push_worker_secret'
        )
      ),
      body := jsonb_build_object('scheduled_at', now())
    );
  $job$
)
where not exists (
  select 1
  from cron.job
  where jobname = 'process-push-notifications'
);

select cron.schedule(
  'cleanup-push-delivery-data',
  '41 3 * * *',
  $job$
    delete from public.push_deliveries
    where created_at <= now() - interval '30 days';

    delete from public.push_devices
    where enabled = false
      and updated_at <= now() - interval '90 days';
  $job$
)
where not exists (
  select 1
  from cron.job
  where jobname = 'cleanup-push-delivery-data'
);
