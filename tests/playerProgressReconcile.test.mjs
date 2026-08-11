import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcilePlayerProgress } from '../src/services/playerProgressReconcile.mjs';

const LOCAL_PROGRESS = {
  achievements: { first_win: true, local_only: true },
  completedDailyDates: { 'daily-old': true },
  completedStreakDates: { '2026-07-29': true },
  completedWeeklyKeys: { '2026-07-27': true },
  stats: {
    bestScore: 500,
    gamesCompleted: 12,
    gamesPlayed: 12,
    perfectGames: 4,
    targetsSolved: 50,
    totalMoves: 80,
    totalScore: 4000,
  },
  streak: {
    best: 8,
    current: 3,
    lastDailyDate: '2026-07-29',
  },
  weeklyScores: { '2026-07-27': 900 },
};

const CLOUD_PROGRESS = {
  achievements: [{ achievement_key: 'first_win' }],
  dailyProgress: [
    {
      date: '2026-07-30',
      daily_challenge_completed: true,
      daily_challenge_key: 'daily-new',
      streak_awarded: true,
    },
  ],
  stats: {
    best_score: 240,
    best_streak: 5,
    current_streak: 1,
    games_completed: 6,
    games_played: 6,
    last_streak_date: '2026-07-30',
    perfect_games: 2,
    targets_solved: 24,
    total_moves: 42,
    total_score: 1800,
  },
  weeklyScore: {
    score: 300,
    week_key: '2026-07-27',
    weekly_challenge_completed: false,
  },
};

test('authoritative reconciliation replaces server-owned local values', () => {
  const result = reconcilePlayerProgress(
    LOCAL_PROGRESS,
    CLOUD_PROGRESS,
    { authoritative: true },
  );

  assert.deepEqual(result.achievements, { first_win: true });
  assert.deepEqual(result.completedDailyDates, { 'daily-new': true });
  assert.deepEqual(result.completedStreakDates, {
    '2026-07-30': true,
  });
  assert.deepEqual(result.completedWeeklyKeys, {});
  assert.equal(result.stats.totalScore, 1800);
  assert.equal(result.stats.gamesCompleted, 6);
  assert.deepEqual(result.streak, {
    best: 5,
    current: 1,
    lastDailyDate: '2026-07-30',
  });
  assert.deepEqual(result.weeklyScores, { '2026-07-27': 300 });
});

test('non-authoritative reconciliation preserves pending local progress', () => {
  const result = reconcilePlayerProgress(
    LOCAL_PROGRESS,
    CLOUD_PROGRESS,
  );

  assert.equal(result.achievements.local_only, true);
  assert.equal(result.completedDailyDates['daily-old'], true);
  assert.equal(result.completedDailyDates['daily-new'], true);
  assert.equal(result.stats.totalScore, 4000);
  assert.equal(result.stats.gamesCompleted, 12);
  assert.equal(result.streak.best, 8);
  assert.equal(result.streak.current, 1);
  assert.equal(result.streak.lastDailyDate, '2026-07-30');
  assert.equal(result.weeklyScores['2026-07-27'], 900);
});

test('authoritative reconciliation resets missing cloud values to zero', () => {
  const result = reconcilePlayerProgress(
    LOCAL_PROGRESS,
    {
      achievements: [],
      dailyProgress: [],
      stats: {},
      weeklyScore: null,
    },
    { authoritative: true },
  );

  assert.equal(result.stats.totalScore, 0);
  assert.equal(result.stats.gamesCompleted, 0);
  assert.equal(result.streak.current, 0);
  assert.equal(result.streak.lastDailyDate, null);
  assert.deepEqual(result.weeklyScores, {});
});

test('missing cloud data returns a detached local snapshot', () => {
  const result = reconcilePlayerProgress(LOCAL_PROGRESS, null, {
    authoritative: true,
  });

  assert.deepEqual(result, LOCAL_PROGRESS);
  assert.notEqual(result.stats, LOCAL_PROGRESS.stats);
});
