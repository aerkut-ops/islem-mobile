const SUPPORTED_OTP_TYPES = new Set([
  'email',
  'email_change',
  'invite',
  'magiclink',
  'recovery',
  'signup',
]);

function normalizePath(pathname) {
  const normalized = pathname.replace(/\/+$/, '');
  return normalized || '/';
}

function mergeCallbackParams(parsedUrl) {
  const params = new URLSearchParams(parsedUrl.search);
  const fragmentParams = new URLSearchParams(parsedUrl.hash.replace(/^#/, ''));

  for (const [key, value] of fragmentParams.entries()) {
    if (!params.has(key)) {
      params.set(key, value);
    }
  }

  return params;
}

export function isAuthCallbackUrl(url, redirectUrl) {
  if (!url || !redirectUrl) {
    return false;
  }

  try {
    const parsedUrl = new URL(url);
    const parsedRedirect = new URL(redirectUrl);

    return (
      parsedUrl.protocol.toLowerCase() === parsedRedirect.protocol.toLowerCase() &&
      parsedUrl.host.toLowerCase() === parsedRedirect.host.toLowerCase() &&
      normalizePath(parsedUrl.pathname) === normalizePath(parsedRedirect.pathname)
    );
  } catch {
    return false;
  }
}

export function parseAuthCallback(url, redirectUrl) {
  if (!isAuthCallbackUrl(url, redirectUrl)) {
    return null;
  }

  const parsedUrl = new URL(url);
  const params = mergeCallbackParams(parsedUrl);
  const type = params.get('type') || null;

  return {
    accessToken: params.get('access_token'),
    code: params.get('code'),
    errorCode: params.get('error_code') || params.get('error'),
    errorDescription: params.get('error_description'),
    refreshToken: params.get('refresh_token'),
    tokenHash: params.get('token_hash'),
    type,
    validOtpType: !type || SUPPORTED_OTP_TYPES.has(type),
  };
}
