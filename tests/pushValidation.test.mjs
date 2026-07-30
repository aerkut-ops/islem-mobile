import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EXPO_PROJECT_ID,
  isExpectedExpoProject,
  normalizeExpoPushToken,
  normalizePushLocale,
  normalizePushRegistrationResult,
} from '../src/services/pushValidation.mjs';

test('Expo push tokens are normalized and strictly validated', () => {
  assert.equal(
    normalizeExpoPushToken(' ExponentPushToken[abc_DEF-123456789] '),
    'ExponentPushToken[abc_DEF-123456789]',
  );
  assert.equal(
    normalizeExpoPushToken('ExpoPushToken[abc_DEF-123456789]'),
    'ExpoPushToken[abc_DEF-123456789]',
  );
  assert.equal(normalizeExpoPushToken('not-a-push-token'), '');
  assert.equal(normalizeExpoPushToken(null), '');
});

test('push registration accepts only the configured EAS project', () => {
  assert.equal(isExpectedExpoProject(EXPO_PROJECT_ID), true);
  assert.equal(
    isExpectedExpoProject('11111111-1111-1111-1111-111111111111'),
    false,
  );
});

test('push locale and registration results are bounded', () => {
  assert.equal(normalizePushLocale('tr'), 'tr');
  assert.equal(normalizePushLocale('TR'), 'tr');
  assert.equal(normalizePushLocale('de'), 'en');
  assert.equal(normalizePushRegistrationResult(true), true);
  assert.equal(normalizePushRegistrationResult('true'), false);
});
