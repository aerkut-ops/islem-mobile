alter table public.profiles
  drop constraint if exists profiles_username_format;

alter table public.profiles
  add constraint profiles_username_format check (
    username is null
    or (
      username = lower(username)
      and username ~ '^[a-z0-9_]{3,24}$'
    )
  );

alter table public.profiles
  drop constraint if exists profiles_display_name_format;

alter table public.profiles
  add constraint profiles_display_name_format check (
    display_name is null
    or (
      display_name = btrim(display_name)
      and char_length(display_name) between 1 and 40
    )
  );

alter table public.profiles
  drop constraint if exists profiles_locale_check;

alter table public.profiles
  add constraint profiles_locale_check check (locale in ('tr', 'en'));

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username))
  where username is not null;

revoke insert, update on public.profiles from authenticated;

create or replace function public.update_own_profile(
  p_username text,
  p_display_name text default null,
  p_locale text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_username text := lower(btrim(coalesce(p_username, '')));
  v_display_name text := nullif(btrim(coalesce(p_display_name, '')), '');
  v_locale text := nullif(lower(btrim(coalesce(p_locale, ''))), '');
  v_profile public.profiles%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  if v_username !~ '^[a-z0-9_]{3,24}$' then
    raise exception using errcode = '22023', message = 'invalid_username';
  end if;

  if v_display_name is not null and char_length(v_display_name) > 40 then
    raise exception using errcode = '22023', message = 'invalid_display_name';
  end if;

  if v_locale is not null and v_locale not in ('tr', 'en') then
    raise exception using errcode = '22023', message = 'invalid_locale';
  end if;

  insert into public.profiles (
    user_id,
    username,
    display_name,
    locale,
    updated_at
  )
  values (
    v_user_id,
    v_username,
    v_display_name,
    coalesce(v_locale, 'tr'),
    now()
  )
  on conflict (user_id) do update
    set
      username = excluded.username,
      display_name = excluded.display_name,
      locale = coalesce(v_locale, public.profiles.locale),
      updated_at = now()
  returning * into v_profile;

  return v_profile;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'username_taken';
end;
$$;

revoke all on function public.update_own_profile(text, text, text)
  from public, anon;
grant execute on function public.update_own_profile(text, text, text)
  to authenticated;
