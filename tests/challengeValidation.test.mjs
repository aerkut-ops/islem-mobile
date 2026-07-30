import assert from 'node:assert/strict';
import test from 'node:test';
import {
  groupChallengeInvites,
  normalizeChallengeResponse,
  normalizeChallengeRoom,
  normalizeChallengeRooms,
} from '../src/services/challengeValidation.mjs';

const room = {
  room_id: 'room-id',
  invite_id: 'invite-id',
  room_code: 'A1B2C3',
  puzzle_seed: 'seed-id',
  status: 'ready',
  is_host: true,
  opponent_id: 'player-id',
  opponent_username: 'oyuncu',
  opponent_display_name: 'Oyuncu',
  created_at: '2026-07-31T10:00:00.000Z',
  expires_at: '2026-08-01T10:00:00.000Z',
};

test('challenge invites are normalized and grouped by direction', () => {
  const grouped = groupChallengeInvites([
    {
      invite_id: 'incoming-id',
      direction: 'incoming',
      player_id: 'sender-id',
      username: 'gonderen',
      display_name: 'Gönderen',
      created_at: '2026-07-31T10:00:00.000Z',
      expires_at: '2026-08-01T10:00:00.000Z',
      email: 'hidden@example.com',
    },
    {
      invite_id: 'outgoing-id',
      direction: 'outgoing',
      player_id: 'receiver-id',
      username: 'alici',
      created_at: '2026-07-31T11:00:00.000Z',
      expires_at: '2026-08-01T11:00:00.000Z',
    },
    { direction: 'invalid' },
  ]);

  assert.equal(grouped.incoming.length, 1);
  assert.equal(grouped.outgoing.length, 1);
  assert.deepEqual(Object.keys(grouped.incoming[0]), [
    'invite_id',
    'direction',
    'player_id',
    'username',
    'display_name',
    'created_at',
    'expires_at',
  ]);
});

test('challenge rooms keep only safe participant fields', () => {
  assert.deepEqual(normalizeChallengeRoom({ ...room, email: 'hidden' }), room);
  assert.deepEqual(normalizeChallengeRooms([room, { status: 'completed' }]), [
    room,
  ]);
});

test('invalid challenge rooms are rejected', () => {
  assert.equal(normalizeChallengeRoom({ ...room, room_id: '' }), null);
  assert.equal(normalizeChallengeRoom({ ...room, status: 'completed' }), null);
  assert.equal(
    normalizeChallengeRoom({ ...room, created_at: 'not-a-date' }),
    null,
  );
});

test('challenge responses default safely', () => {
  assert.deepEqual(normalizeChallengeResponse({ result: 'accepted', room }), {
    result: 'accepted',
    room,
  });
  assert.deepEqual(normalizeChallengeResponse(null), {
    result: 'unknown',
    room: null,
  });
});
