import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizePushAction,
  pushActionFromNotification,
  pushActionFromResponse,
} from '../src/services/pushNavigation.mjs';

test('challenge race notifications open the challenge screen', () => {
  for (const type of [
    'challenge_accepted',
    'challenge_ready',
    'challenge_started',
  ]) {
    assert.deepEqual(
      normalizePushAction({
        entityId: 'room-id',
        notificationId: 'notification-id',
        screen: 'friends',
        type,
      }),
      {
        entityId: 'room-id',
        notificationId: 'notification-id',
        screen: 'challenge',
        type,
      },
    );
  }
});

test('friend and invitation notifications open the friends screen', () => {
  assert.equal(
    normalizePushAction({ type: 'challenge_invite' }).screen,
    'friends',
  );
  assert.equal(
    normalizePushAction({ type: 'friend_request' }).screen,
    'friends',
  );
});

test('profile moderation notifications open the account screen', () => {
  assert.deepEqual(
    normalizePushAction({
      entityId: 'report-id',
      notificationId: 'notification-id',
      screen: 'friends',
      type: 'moderation_profile_cleared',
    }),
    {
      entityId: 'report-id',
      notificationId: 'notification-id',
      screen: 'account',
      type: 'moderation_profile_cleared',
    },
  );
});

test('notification payloads are bounded and unsupported types are ignored', () => {
  assert.equal(normalizePushAction(null), null);
  assert.equal(normalizePushAction({ type: 'private_message' }), null);
  assert.deepEqual(
    normalizePushAction({
      entityId: 'x'.repeat(101),
      notificationId: ' notification-id ',
      type: 'friend_accepted',
    }),
    {
      entityId: null,
      notificationId: 'notification-id',
      screen: 'friends',
      type: 'friend_accepted',
    },
  );
});

test('notification and response helpers read only notification data', () => {
  const notification = {
    request: {
      content: {
        data: {
          entityId: 'room-id',
          notificationId: 'notification-id',
          type: 'challenge_started',
        },
      },
    },
  };
  assert.equal(
    pushActionFromNotification(notification).screen,
    'challenge',
  );
  assert.equal(
    pushActionFromResponse({ notification }).type,
    'challenge_started',
  );
});
