import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeFriendLeaderboard,
  validateWeekKey,
} from '../src/services/leaderboardValidation.mjs';

test('weekly leaderboard accepts only a date-shaped week key', () => {
  assert.deepEqual(validateWeekKey(' 2026-07-27 '), {
    error: null,
    weekKey: '2026-07-27',
  });
  assert.equal(validateWeekKey('2026-W31').error, 'invalid_week_key');
  assert.equal(validateWeekKey('').error, 'invalid_week_key');
});

test('friend leaderboard normalizes safe rows and sorts by position', () => {
  assert.deepEqual(
    normalizeFriendLeaderboard([
      {
        display_name: 'Second',
        is_current_user: false,
        player_id: 'player-2',
        rank_position: 2,
        score: '20',
        username: 'second',
      },
      {
        display_name: 'First',
        is_current_user: true,
        player_id: 'player-1',
        rank_position: 1,
        score: 40.8,
        username: 'first',
      },
      { player_id: null, rank_position: 3, score: 10 },
    ]),
    [
      {
        display_name: 'First',
        is_current_user: true,
        player_id: 'player-1',
        position: 1,
        score: 40,
        username: 'first',
      },
      {
        display_name: 'Second',
        is_current_user: false,
        player_id: 'player-2',
        position: 2,
        score: 20,
        username: 'second',
      },
    ],
  );
});

test('negative scores are clamped and missing positions get a fallback', () => {
  assert.deepEqual(
    normalizeFriendLeaderboard([
      {
        is_current_user: false,
        player_id: 'player-1',
        rank_position: null,
        score: -10,
      },
    ]),
    [
      {
        display_name: null,
        is_current_user: false,
        player_id: 'player-1',
        position: 1,
        score: 0,
        username: null,
      },
    ],
  );
});
