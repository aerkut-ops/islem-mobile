create extension if not exists unaccent with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.profile_content_rules (
  id bigint generated always as identity primary key,
  normalized_term text not null,
  match_mode text not null,
  category text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_content_rules_term_check check (
    normalized_term = lower(btrim(normalized_term))
    and normalized_term ~ '^[a-z0-9]+( [a-z0-9]+)*$'
  ),
  constraint profile_content_rules_match_mode_check check (
    match_mode in ('exact', 'word', 'contains')
  ),
  constraint profile_content_rules_category_check check (
    category in ('impersonation', 'abuse', 'sexual')
  ),
  constraint profile_content_rules_unique unique (normalized_term, match_mode)
);

revoke all on private.profile_content_rules from public, anon, authenticated;

insert into private.profile_content_rules (
  normalized_term,
  match_mode,
  category
)
values
  ('admin', 'exact', 'impersonation'),
  ('administrator', 'exact', 'impersonation'),
  ('moderator', 'exact', 'impersonation'),
  ('official', 'exact', 'impersonation'),
  ('support', 'exact', 'impersonation'),
  ('system', 'exact', 'impersonation'),
  ('amk', 'word', 'abuse'),
  ('aq', 'exact', 'abuse'),
  ('asshole', 'contains', 'abuse'),
  ('bastard', 'word', 'abuse'),
  ('bitch', 'word', 'abuse'),
  ('cunt', 'contains', 'abuse'),
  ('faggot', 'contains', 'abuse'),
  ('fuck', 'contains', 'abuse'),
  ('ibne', 'word', 'abuse'),
  ('kahpe', 'word', 'abuse'),
  ('nazi', 'word', 'abuse'),
  ('nigga', 'contains', 'abuse'),
  ('nigger', 'contains', 'abuse'),
  ('orospu', 'contains', 'abuse'),
  ('pezevenk', 'contains', 'abuse'),
  ('pic', 'word', 'abuse'),
  ('shit', 'contains', 'abuse'),
  ('siktir', 'contains', 'abuse'),
  ('whore', 'word', 'abuse'),
  ('yarrak', 'contains', 'abuse'),
  ('porn', 'contains', 'sexual'),
  ('porno', 'contains', 'sexual'),
  ('sex', 'word', 'sexual'),
  ('sexy', 'word', 'sexual')
on conflict (normalized_term, match_mode) do update
set
  active = true,
  category = excluded.category,
  updated_at = now();

create or replace function private.normalize_profile_content(p_value text)
returns text
language sql
stable
set search_path = ''
as $$
  select btrim(
    pg_catalog.regexp_replace(
      pg_catalog.regexp_replace(
        pg_catalog.translate(
          pg_catalog.lower(extensions.unaccent(coalesce(p_value, ''))),
          '013457@$ı',
          'oieast  i'
        ),
        '[^a-z0-9]+',
        ' ',
        'g'
      ),
      '[[:space:]]+',
      ' ',
      'g'
    )
  );
$$;

revoke all on function private.normalize_profile_content(text)
  from public, anon, authenticated;

create or replace function private.is_profile_content_blocked(p_value text)
returns boolean
language sql
stable
set search_path = ''
as $$
  with candidate as (
    select private.normalize_profile_content(p_value) as normalized
  )
  select exists (
    select 1
    from private.profile_content_rules rule
    cross join candidate
    where
      rule.active
      and candidate.normalized <> ''
      and case rule.match_mode
        when 'exact' then candidate.normalized = rule.normalized_term
        when 'word' then
          (' ' || candidate.normalized || ' ')
            like ('% ' || rule.normalized_term || ' %')
        when 'contains' then
          position(
            replace(rule.normalized_term, ' ', '')
            in replace(candidate.normalized, ' ', '')
          ) > 0
        else false
      end
  );
$$;

revoke all on function private.is_profile_content_blocked(text)
  from public, anon, authenticated;

update public.profiles
set
  username = null,
  updated_at = now()
where
  username is not null
  and private.is_profile_content_blocked(username);

update public.profiles
set
  display_name = null,
  updated_at = now()
where
  display_name is not null
  and private.is_profile_content_blocked(display_name);

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

  if
    private.is_profile_content_blocked(v_username)
    or private.is_profile_content_blocked(v_display_name)
  then
    raise exception using
      errcode = '22023',
      message = 'profile_content_not_allowed';
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
