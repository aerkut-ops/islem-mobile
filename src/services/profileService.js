import { isSupabaseConfigured, supabase } from './supabaseClient';
import { validateProfileInput } from './profileValidation.mjs';

const PROFILE_SELECT =
  'user_id,username,display_name,avatar_key,locale,created_at,updated_at';

export async function loadOwnProfile(userId) {
  requireProfileService(userId);

  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || {
    avatar_key: null,
    display_name: null,
    locale: 'tr',
    user_id: userId,
    username: null,
  };
}

export async function updateOwnProfile({
  displayName,
  locale,
  userId,
  username,
}) {
  requireProfileService(userId);

  const normalized = validateProfileInput({ displayName, username });
  if (normalized.error) {
    throw makeProfileError(normalized.error);
  }

  const { data, error } = await supabase.rpc('update_own_profile', {
    p_display_name: normalized.displayName || null,
    p_locale: locale || null,
    p_username: normalized.username,
  });

  if (error) {
    throw error;
  }

  const profile = Array.isArray(data) ? data[0] : data;
  if (!profile || profile.user_id !== userId) {
    throw makeProfileError('invalid_profile_response');
  }

  return profile;
}

function requireProfileService(userId) {
  if (!isSupabaseConfigured || !supabase || !userId) {
    throw makeProfileError('profile_unavailable');
  }
}

function makeProfileError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
