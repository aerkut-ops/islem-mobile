import { isSupabaseConfigured, supabase } from './supabaseClient';
import { getActiveStreak } from '../utils/streak';

const EMPTY_PLAYER_STATS = {
  best_score: 0,
  best_streak: 0,
  current_streak: 0,
  games_completed: 0,
  games_played: 0,
  last_streak_date: null,
  perfect_games: 0,
  targets_solved: 0,
  total_moves: 0,
  total_score: 0,
};

export async function loadPlayerCloudStats(userId) {
  if (!isSupabaseConfigured || !supabase || !userId) {
    return null;
  }

  const { data, error } = await selectPlayerStats(userId);

  if (error) {
    throw error;
  }

  return normalizePlayerStats(data);
}

export async function loadPlayerCloudProgress(userId, weekKey) {
  if (!isSupabaseConfigured || !supabase || !userId) {
    return null;
  }

  const [statsResult, dailyResult, weeklyResult, achievementsResult] = await Promise.all([
    selectPlayerStats(userId),
    supabase
      .from('daily_progress')
      .select('date,streak_awarded,daily_challenge_key,daily_challenge_completed')
      .eq('user_id', userId),
    supabase
      .from('weekly_scores')
      .select('week_key,score,weekly_challenge_key,weekly_challenge_completed')
      .eq('user_id', userId)
      .eq('week_key', weekKey)
      .maybeSingle(),
    supabase
      .from('achievement_unlocks')
      .select('achievement_key')
      .eq('user_id', userId),
  ]);

  const firstError = [
    statsResult.error,
    dailyResult.error,
    weeklyResult.error,
    achievementsResult.error,
  ].find(Boolean);
  if (firstError) {
    throw firstError;
  }

  return {
    achievements: achievementsResult.data || [],
    dailyProgress: dailyResult.data || [],
    stats: normalizePlayerStats(statsResult.data),
    weeklyScore: weeklyResult.data || null,
  };
}

function selectPlayerStats(userId) {
  return supabase
    .from('player_stats')
    .select(
      'total_score,best_score,games_played,games_completed,perfect_games,targets_solved,total_moves,current_streak,best_streak,last_streak_date',
    )
    .eq('user_id', userId)
    .maybeSingle();
}

function normalizePlayerStats(data) {
  const stats = data ? { ...EMPTY_PLAYER_STATS, ...data } : { ...EMPTY_PLAYER_STATS };
  return {
    ...stats,
    current_streak: getActiveStreak(stats.current_streak, stats.last_streak_date),
  };
}
