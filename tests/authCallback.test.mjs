import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isAuthCallbackUrl,
  parseAuthCallback,
} from '../src/services/authCallback.mjs';

const REDIRECT_URL = 'islem://auth/callback';

test('ignores URLs outside the auth callback', () => {
  assert.equal(parseAuthCallback('islem://home', REDIRECT_URL), null);
  assert.equal(
    parseAuthCallback('islem://auth/callback-extra?code=secret', REDIRECT_URL),
    null,
  );
});

test('matches callback URLs with a trailing slash', () => {
  assert.equal(
    isAuthCallbackUrl('islem://auth/callback/?code=secret', REDIRECT_URL),
    true,
  );
});

test('parses a PKCE authorization code', () => {
  const callback = parseAuthCallback(
    'islem://auth/callback?code=authorization-code',
    REDIRECT_URL,
  );

  assert.equal(callback.code, 'authorization-code');
  assert.equal(callback.tokenHash, null);
});

test('parses a direct token hash callback', () => {
  const callback = parseAuthCallback(
    'islem://auth/callback?token_hash=hashed-token&type=signup',
    REDIRECT_URL,
  );

  assert.equal(callback.tokenHash, 'hashed-token');
  assert.equal(callback.type, 'signup');
  assert.equal(callback.validOtpType, true);
});

test('merges fragment session credentials without replacing query values', () => {
  const callback = parseAuthCallback(
    'islem://auth/callback?type=magiclink#access_token=access&refresh_token=refresh&type=recovery',
    REDIRECT_URL,
  );

  assert.equal(callback.accessToken, 'access');
  assert.equal(callback.refreshToken, 'refresh');
  assert.equal(callback.type, 'magiclink');
});

test('surfaces callback errors', () => {
  const callback = parseAuthCallback(
    'islem://auth/callback#error=access_denied&error_code=otp_expired&error_description=Expired',
    REDIRECT_URL,
  );

  assert.equal(callback.errorCode, 'otp_expired');
  assert.equal(callback.errorDescription, 'Expired');
});

test('rejects unsupported OTP types', () => {
  const callback = parseAuthCallback(
    'islem://auth/callback?token_hash=hashed-token&type=unknown',
    REDIRECT_URL,
  );

  assert.equal(callback.validOtpType, false);
});
