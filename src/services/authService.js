import { isSupabaseConfigured, supabase } from './supabaseClient';
import {
  detachPushTokenBeforeSignOut,
  resumePushRegistrationAfterSignOut,
} from './pushService';
import { parseAuthCallback } from './authCallback.mjs';

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

export async function signUpWithPassword(email, password, captchaToken) {
  requireSupabase();

  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      captchaToken: captchaToken || undefined,
      emailRedirectTo: AUTH_REDIRECT_URL,
    },
  });

  if (error) {
    throw error;
  }

  if (
    data.user &&
    Array.isArray(data.user.identities) &&
    data.user.identities.length === 0
  ) {
    throw createAuthError(
      'user_already_exists',
      'An account already exists for this email address.',
    );
  }

  return data;
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
  if (!isSupabaseConfigured || !supabase) {
    return null;
  }

  const callback = parseAuthCallback(url, AUTH_REDIRECT_URL);
  if (!callback) {
    return null;
  }

  if (callback.errorCode) {
    throw createAuthError(
      callback.errorCode,
      callback.errorDescription || 'The sign-in link could not be completed.',
    );
  }

  if (callback.tokenHash) {
    if (!callback.type || !callback.validOtpType) {
      throw createAuthError(
        'auth_callback_invalid_type',
        'The sign-in link has an invalid verification type.',
      );
    }

    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: callback.tokenHash,
      type: callback.type,
    });
    if (error) {
      throw error;
    }
    return requireCallbackSession(data.session, callback.type);
  }

  if (callback.code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(
      callback.code,
    );
    if (error) {
      throw error;
    }
    return requireCallbackSession(data.session, callback.type);
  }

  if (callback.accessToken && callback.refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: callback.accessToken,
      refresh_token: callback.refreshToken,
    });
    if (error) {
      throw error;
    }
    return requireCallbackSession(data.session, callback.type);
  }

  throw createAuthError(
    'auth_callback_missing_credentials',
    'The sign-in link did not include session credentials.',
  );
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
  try {
    await detachPushTokenBeforeSignOut();
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }
  } finally {
    resumePushRegistrationAfterSignOut();
  }
}

function requireSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured.');
  }
}

function requireCallbackSession(session, callbackType) {
  if (!session) {
    throw createAuthError(
      'auth_callback_missing_session',
      'The sign-in link did not create a session.',
    );
  }

  return {
    callbackType: callbackType || null,
    session,
  };
}

function createAuthError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
