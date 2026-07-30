const EMPTY_STATS = {
  bestScore: 0,
  gamesCompleted: 0,
  gamesPlayed: 0,
  perfectGames: 0,
  targetsSolved: 0,
  totalMoves: 0,
  totalScore: 0,
};

const EMPTY_STREAK = {
  best: 0,
  current: 0,
  lastDailyDate: null,
};

export function reconcilePlayerProgress(
  localProgress,
  cloudProgress,
  { authoritative = false } = {},
) {
  const local = normalizeLocalProgress(localProgress);
  if (!cloudProgress) {
    return local;
  }

  const cloud = projectCloudProgress(cloudProgress);
  if (authoritative) {
    return {
      ...local,
      achievements: cloud.achievements,
      completedDailyDates: cloud.completedDailyDates,
      completedStreakDates: cloud.completedStreakDates,
      completedWeeklyKeys: cloud.completedWeeklyKeys,
      stats: {
        ...local.stats,
        ...cloud.stats,
      },
      streak: {
        ...local.streak,
        ...cloud.streak,
      },
      weeklyScores: cloud.weeklyScores,
    };
  }

  const cloudStreakIsNewer = Boolean(
    cloud.streak.lastDailyDate &&
      (!local.streak.lastDailyDate ||
        cloud.streak.lastDailyDate >= local.streak.lastDailyDate),
  );

  return {
    ...local,
    achievements: {
      ...local.achievements,
      ...cloud.achievements,
    },
    completedDailyDates: {
      ...local.completedDailyDates,
      ...cloud.completedDailyDates,
    },
    completedStreakDates: {
      ...local.completedStreakDates,
      ...cloud.completedStreakDates,
    },
    completedWeeklyKeys: {
      ...local.completedWeeklyKeys,
      ...cloud.completedWeeklyKeys,
    },
    stats: {
      ...local.stats,
      ...Object.fromEntries(
        Object.keys(EMPTY_STATS).map((key) => [
          key,
          Math.max(local.stats[key], cloud.stats[key]),
        ]),
      ),
    },
    streak: {
      best: Math.max(local.streak.best, cloud.streak.best),
      current: cloudStreakIsNewer
        ? cloud.streak.current
        : local.streak.current,
      lastDailyDate: cloudStreakIsNewer
        ? cloud.streak.lastDailyDate
        : local.streak.lastDailyDate,
    },
    weeklyScores: mergeMaximumScores(
      local.weeklyScores,
      cloud.weeklyScores,
    ),
  };
}

function normalizeLocalProgress(progress) {
  return {
    ...progress,
    achievements: { ...(progress?.achievements || {}) },
    completedDailyDates: { ...(progress?.completedDailyDates || {}) },
    completedStreakDates: { ...(progress?.completedStreakDates || {}) },
    completedWeeklyKeys: { ...(progress?.completedWeeklyKeys || {}) },
    stats: {
      ...EMPTY_STATS,
      ...(progress?.stats || {}),
    },
    streak: {
      ...EMPTY_STREAK,
      ...(progress?.streak || {}),
    },
    weeklyScores: { ...(progress?.weeklyScores || {}) },
  };
}

function projectCloudProgress(cloudProgress) {
  const cloudStats = cloudProgress.stats || {};
  const completedDailyDates = {};
  const completedStreakDates = {};

  for (const day of cloudProgress.dailyProgress || []) {
    if (day.daily_challenge_completed) {
      completedDailyDates[day.daily_challenge_key || day.date] = true;
    }
    if (day.streak_awarded) {
      completedStreakDates[day.date] = true;
    }
  }

  const achievements = Object.fromEntries(
    (cloudProgress.achievements || []).map(
      ({ achievement_key: key }) => [key, true],
    ),
  );
  const weekly = cloudProgress.weeklyScore;

  return {
    achievements,
    completedDailyDates,
    completedStreakDates,
    completedWeeklyKeys:
      weekly?.weekly_challenge_completed && weekly.week_key
        ? { [weekly.week_key]: true }
        : {},
    stats: {
      bestScore: toCount(cloudStats.best_score),
      gamesCompleted: toCount(cloudStats.games_completed),
      gamesPlayed: toCount(cloudStats.games_played),
      perfectGames: toCount(cloudStats.perfect_games),
      targetsSolved: toCount(cloudStats.targets_solved),
      totalMoves: toCount(cloudStats.total_moves),
      totalScore: toCount(cloudStats.total_score),
    },
    streak: {
      best: toCount(cloudStats.best_streak),
      current: toCount(cloudStats.current_streak),
      lastDailyDate: cloudStats.last_streak_date || null,
    },
    weeklyScores: weekly?.week_key
      ? { [weekly.week_key]: toCount(weekly.score) }
      : {},
  };
}

function mergeMaximumScores(localScores, cloudScores) {
  const keys = new Set([
    ...Object.keys(localScores),
    ...Object.keys(cloudScores),
  ]);

  return Object.fromEntries(
    [...keys].map((key) => [
      key,
      Math.max(toCount(localScores[key]), toCount(cloudScores[key])),
    ]),
  );
}

function toCount(value) {
  return Math.max(0, Number(value) || 0);
}
