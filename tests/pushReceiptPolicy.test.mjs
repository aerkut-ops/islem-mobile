import assert from 'node:assert/strict';
import test from 'node:test';
import {
  shouldDisablePushDevice,
} from '../supabase/functions/push-worker/receiptPolicy.mjs';

test('permanently invalid push devices are disabled', () => {
  assert.equal(
    shouldDisablePushDevice('DeviceNotRegistered', 'not registered'),
    true,
  );
  assert.equal(
    shouldDisablePushDevice(
      'DeveloperError',
      'Apple rejected the notification with BadDeviceToken.',
    ),
    true,
  );
});

test('credential and temporary receipt failures keep the device active', () => {
  assert.equal(
    shouldDisablePushDevice('InvalidCredentials', 'missing APNs key'),
    false,
  );
  assert.equal(
    shouldDisablePushDevice('DeveloperError', 'InvalidProviderToken'),
    false,
  );
  assert.equal(shouldDisablePushDevice(null, null), false);
});
