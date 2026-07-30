import assert from 'node:assert/strict';
import test from 'node:test';
import {
  groupFriendConnections,
  normalizeFriendProfile,
  normalizeIncomingFriendRequestCount,
  normalizePlayerSearch,
  validatePlayerSearch,
} from '../src/services/friendValidation.mjs';

test('player search is trimmed, lowercased, and accepts an at sign', () => {
  assert.equal(normalizePlayerSearch('  @Islem_Player  '), 'islem_player');
});

test('player search requires between two and forty characters', () => {
  assert.equal(validatePlayerSearch('a').error, 'invalid_search');
  assert.equal(validatePlayerSearch('a'.repeat(41)).error, 'invalid_search');
  assert.deepEqual(validatePlayerSearch('  Test  '), {
    error: null,
    query: 'test',
  });
});

test('friend connections are grouped by server relationship', () => {
  const friend = { connection_type: 'friend', player_id: 'friend-id' };
  const incoming = { connection_type: 'incoming', player_id: 'incoming-id' };
  const outgoing = { connection_type: 'outgoing', player_id: 'outgoing-id' };

  assert.deepEqual(
    groupFriendConnections([friend, incoming, outgoing]),
    {
      friends: [friend],
      incoming: [incoming],
      outgoing: [outgoing],
    },
  );
});

test('malformed and unknown connection rows are ignored', () => {
  assert.deepEqual(
    groupFriendConnections([
      null,
      { connection_type: 'blocked', player_id: 'blocked-id' },
      { connection_type: 'friend' },
    ]),
    { friends: [], incoming: [], outgoing: [] },
  );
});

test('friend profile keeps only normalized public statistics', () => {
  assert.deepEqual(
    normalizeFriendProfile({
      player_id: 'friend-id',
      username: 'friend_name',
      display_name: 'Friend Name',
      total_score: '1250',
      best_score: 84.9,
      games_completed: 11,
      best_streak: -3,
      weekly_score: null,
      email: 'hidden@example.com',
    }),
    {
      player_id: 'friend-id',
      username: 'friend_name',
      display_name: 'Friend Name',
      total_score: 1250,
      best_score: 84,
      games_completed: 11,
      best_streak: 0,
      weekly_score: 0,
    },
  );
});

test('invalid friend profiles are rejected', () => {
  assert.equal(normalizeFriendProfile(null), null);
  assert.equal(normalizeFriendProfile({ player_id: 'friend-id' }), null);
});

test('incoming request count is a non-negative integer', () => {
  assert.equal(normalizeIncomingFriendRequestCount('3'), 3);
  assert.equal(normalizeIncomingFriendRequestCount(2.8), 2);
  assert.equal(normalizeIncomingFriendRequestCount(-5), 0);
  assert.equal(normalizeIncomingFriendRequestCount('invalid'), 0);
});
