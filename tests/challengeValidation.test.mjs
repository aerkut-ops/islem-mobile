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
  started_at: null,
  expires_at: '2026-08-01T10:00:00.000Z',
  target_count: 5,
  own_ready: false,
  opponent_ready: false,
  own_solved_targets: 0,
  opponent_solved_targets: 0,
  own_moves: 0,
  opponent_moves: 0,
  own_score: null,
  opponent_score: null,
  own_completed_at: null,
  opponent_completed_at: null,
  outcome: 'racing',
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
  assert.deepEqual(normalizeChallengeRooms([room, { room_id: '' }]), [room]);
});

test('invalid challenge rooms are rejected', () => {
  assert.equal(normalizeChallengeRoom({ ...room, room_id: '' }), null);
  assert.equal(normalizeChallengeRoom({ ...room, status: 'completed' }), null);
  assert.equal(
    normalizeChallengeRoom({
      ...room,
      status: 'active',
      started_at: null,
    }),
    null,
  );
  assert.equal(
    normalizeChallengeRoom({
      ...room,
      own_solved_targets: 6,
    }),
    null,
  );
  assert.equal(
    normalizeChallengeRoom({ ...room, created_at: 'not-a-date' }),
    null,
  );
});

test('completed challenge rooms require both safe results', () => {
  const completed = {
    ...room,
    status: 'completed',
    started_at: '2026-07-31T10:01:00.000Z',
    own_ready: true,
    opponent_ready: true,
    own_solved_targets: 5,
    opponent_solved_targets: 5,
    own_moves: 7,
    opponent_moves: 8,
    own_score: 136,
    opponent_score: 134,
    own_completed_at: '2026-07-31T10:02:00.000Z',
    opponent_completed_at: '2026-07-31T10:02:05.000Z',
    outcome: 'won',
  };

  assert.deepEqual(normalizeChallengeRoom(completed), completed);
  assert.equal(
    normalizeChallengeRoom({
      ...completed,
      opponent_completed_at: null,
    }),
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
