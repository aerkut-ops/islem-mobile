import { isSupabaseConfigured, supabase } from './supabaseClient';

export const AUTH_REDIRECT_URL =
  process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL || 'islem://auth/callback';

export async function sendMagicLink(email, captchaToken) {
  requireSupabase();

  const normalizedEmail = email.trim().toLowerCase();
  const { error } = await supabase.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      emailRedirectTo: AUTH_REDIRECT_URL,
      shouldCreateUser: true,
      captchaToken: captchaToken || undefined,
    },
  });

  if (error) {
    throw error;
  }
}

export async function signInWithPassword(email, password, captchaToken) {
  requireSupabase();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
    options: {
      captchaToken: captchaToken || undefined,
    },
  });

  if (error) {
    throw error;
  }
  return data.session || null;
}

export async function handleAuthCallback(url) {
  if (!isSupabaseConfigured || !supabase || !url?.startsWith(AUTH_REDIRECT_URL)) {
    return null;
  }

  const parsedUrl = new URL(url);
  const code = parsedUrl.searchParams.get('code');
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      throw error;
    }
    return data.session || null;
  }

  const hashParams = new URLSearchParams(parsedUrl.hash.replace(/^#/, ''));
  const accessToken = hashParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token');
  if (!accessToken || !refreshToken) {
    return null;
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) {
    throw error;
  }
  return data.session || null;
}

export function subscribeToAuthChanges(callback) {
  if (!isSupabaseConfigured || !supabase) {
    return () => {};
  }

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session || null);
  });
  return () => data.subscription.unsubscribe();
}

export async function signOut() {
  requireSupabase();
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
}

function requireSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured.');
  }
}
