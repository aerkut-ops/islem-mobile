import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeNotificationIds,
  normalizeNotificationLimit,
  normalizeNotifications,
  normalizeUnreadNotificationCount,
} from '../src/services/notificationValidation.mjs';

test('notifications keep only safe supported fields', () => {
  assert.deepEqual(
    normalizeNotifications([
      {
        notification_id: 'older-notification',
        notification_type: 'friend_request',
        actor_id: 'actor-id',
        actor_username: 'player_one',
        actor_display_name: 'Player One',
        entity_id: 'request-id',
        is_read: false,
        created_at: '2026-07-29T12:00:00.000Z',
        email: 'hidden@example.com',
        payload: { hidden: true },
      },
      {
        notification_id: 'newer-notification',
        notification_type: 'challenge_started',
        actor_id: 'actor-id',
        actor_username: 'player_one',
        entity_id: 'room-id',
        is_read: true,
        created_at: '2026-07-30T12:00:00.000Z',
      },
      {
        notification_id: 'system-notification',
        notification_type: 'moderation_profile_cleared',
        actor_id: 'must-not-leak',
        actor_username: 'must_not_leak',
        actor_display_name: 'Must Not Leak',
        entity_id: 'report-id',
        is_read: false,
        created_at: '2026-07-31T12:00:00.000Z',
      },
    ]),
    [
      {
        notification_id: 'system-notification',
        notification_type: 'moderation_profile_cleared',
        actor_id: null,
        actor_username: null,
        actor_display_name: null,
        entity_id: 'report-id',
        is_read: false,
        created_at: '2026-07-31T12:00:00.000Z',
      },
      {
        notification_id: 'newer-notification',
        notification_type: 'challenge_started',
        actor_id: 'actor-id',
        actor_username: 'player_one',
        actor_display_name: null,
        entity_id: 'room-id',
        is_read: true,
        created_at: '2026-07-30T12:00:00.000Z',
      },
      {
        notification_id: 'older-notification',
        notification_type: 'friend_request',
        actor_id: 'actor-id',
        actor_username: 'player_one',
        actor_display_name: 'Player One',
        entity_id: 'request-id',
        is_read: false,
        created_at: '2026-07-29T12:00:00.000Z',
      },
    ],
  );
});

test('malformed and unsupported notifications are ignored', () => {
  assert.deepEqual(
    normalizeNotifications([
      null,
      {
        notification_id: 'unsupported',
        notification_type: 'private_message',
        actor_id: 'actor-id',
        actor_username: 'player_one',
        entity_id: 'message-id',
        created_at: '2026-07-30T12:00:00.000Z',
      },
      {
        notification_id: 'invalid-date',
        notification_type: 'friend_request',
        actor_id: 'actor-id',
        actor_username: 'player_one',
        entity_id: 'request-id',
        created_at: 'not-a-date',
      },
      {
        notification_id: 'missing-actor',
        notification_type: 'friend_request',
        entity_id: 'request-id',
        created_at: '2026-07-30T12:00:00.000Z',
      },
    ]),
    [],
  );
});

test('notification limits, counts, and ids are bounded', () => {
  assert.equal(normalizeNotificationLimit(undefined), 30);
  assert.equal(normalizeNotificationLimit(0), 30);
  assert.equal(normalizeNotificationLimit(8.9), 8);
  assert.equal(normalizeNotificationLimit(500), 50);
  assert.equal(normalizeUnreadNotificationCount('4'), 4);
  assert.equal(normalizeUnreadNotificationCount(-3), 0);
  assert.equal(normalizeUnreadNotificationCount('invalid'), 0);
  assert.deepEqual(
    normalizeNotificationIds(['one', '', 'one', null, 'two']),
    ['one', 'two'],
  );
  assert.equal(
    normalizeNotificationIds(
      Array.from({ length: 80 }, (_, index) => `id-${index}`),
    ).length,
    50,
  );
});
