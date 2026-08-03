import assert from 'node:assert/strict';
import test from 'node:test';
import {
  groupFriendConnections,
  normalizeBlockedPlayers,
  normalizeFriendActivity,
  normalizeFriendActivityLimit,
  normalizeFriendProfile,
  normalizeIncomingFriendRequestCount,
  normalizePlayerSearch,
  validatePlayerSearch,
} from '../src/services/friendValidation.mjs';

test('normalizeBlockedPlayers keeps safe valid rows newest first', () => {
  assert.deepEqual(
    normalizeBlockedPlayers([
      {
        blocked_at: '2026-08-01T09:00:00.000Z',
        display_name: 'First',
        player_id: 'first-id',
        username: 'first_player',
      },
      { blocked_at: 'invalid', player_id: 'invalid-id', username: 'invalid' },
      {
        blocked_at: '2026-08-02T09:00:00.000Z',
        display_name: null,
        player_id: 'second-id',
        username: 'second_player',
      },
    ]),
    [
      {
        blocked_at: '2026-08-02T09:00:00.000Z',
        display_name: null,
        player_id: 'second-id',
        username: 'second_player',
      },
      {
        blocked_at: '2026-08-01T09:00:00.000Z',
        display_name: 'First',
        player_id: 'first-id',
        username: 'first_player',
      },
    ],
  );
});

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

test('friend activity keeps safe completed-game summary fields', () => {
  assert.deepEqual(
    normalizeFriendActivity([
      {
        activity_id: 'activity-old',
        player_id: 'friend-id',
        username: 'friend_name',
        display_name: 'Friend Name',
        mode: 'daily',
        difficulty: 'hard',
        awarded_score: '90',
        targets_solved: 4,
        target_count: 5,
        duration_seconds: 65.8,
        played_at: '2026-07-29T10:00:00.000Z',
        email: 'hidden@example.com',
        payload: { hidden: true },
      },
      {
        activity_id: 'activity-new',
        player_id: 'friend-id',
        username: 'friend_name',
        mode: 'normal',
        difficulty: 'easy',
        awarded_score: -2,
        targets_solved: 3,
        target_count: 3,
        duration_seconds: 30,
        played_at: '2026-07-30T10:00:00.000Z',
      },
    ]),
    [
      {
        activity_id: 'activity-new',
        player_id: 'friend-id',
        username: 'friend_name',
        display_name: null,
        mode: 'normal',
        difficulty: 'easy',
        awarded_score: 0,
        targets_solved: 3,
        target_count: 3,
        duration_seconds: 30,
        played_at: '2026-07-30T10:00:00.000Z',
      },
      {
        activity_id: 'activity-old',
        player_id: 'friend-id',
        username: 'friend_name',
        display_name: 'Friend Name',
        mode: 'daily',
        difficulty: 'hard',
        awarded_score: 90,
        targets_solved: 4,
        target_count: 5,
        duration_seconds: 65,
        played_at: '2026-07-29T10:00:00.000Z',
      },
    ],
  );
});

test('malformed activity rows are ignored and limits are bounded', () => {
  assert.deepEqual(
    normalizeFriendActivity([
      null,
      {
        activity_id: 'invalid-mode',
        player_id: 'friend-id',
        username: 'friend_name',
        mode: 'private',
        difficulty: 'easy',
        played_at: '2026-07-30T10:00:00.000Z',
      },
      {
        activity_id: 'invalid-date',
        player_id: 'friend-id',
        username: 'friend_name',
        mode: 'normal',
        difficulty: 'easy',
        played_at: 'not-a-date',
      },
    ]),
    [],
  );
  assert.equal(normalizeFriendActivityLimit(undefined), 12);
  assert.equal(normalizeFriendActivityLimit(0), 12);
  assert.equal(normalizeFriendActivityLimit(5.9), 5);
  assert.equal(normalizeFriendActivityLimit(200), 20);
});
