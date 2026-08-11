import {
  normalizeFriendLeaderboard,
  normalizeWeeklyLeagueLeaderboard,
  validateWeekKey,
} from './leaderboardValidation.mjs';
import { isSupabaseConfigured, supabase } from './supabaseClient';

export async function loadFriendWeeklyLeaderboard(weekKey) {
  if (!isSupabaseConfigured || !supabase) {
    throw makeLeaderboardError('leaderboard_unavailable');
  }

  const validated = validateWeekKey(weekKey);
  if (validated.error) {
    throw makeLeaderboardError(validated.error);
  }

  const { data, error } = await supabase.rpc(
    'list_friend_weekly_leaderboard',
    {
      p_week_key: validated.weekKey,
    },
  );
  if (error) {
    throw error;
  }

  return normalizeFriendLeaderboard(data);
}

export async function loadWeeklyLeagueLeaderboard(weekKey) {
  if (!isSupabaseConfigured || !supabase) {
    throw makeLeaderboardError('leaderboard_unavailable');
  }

  const validated = validateWeekKey(weekKey);
  if (validated.error) {
    throw makeLeaderboardError(validated.error);
  }

  const { data, error } = await supabase.rpc(
    'list_weekly_league_leaderboard',
    {
      p_week_key: validated.weekKey,
    },
  );
  if (error) {
    throw error;
  }

  return normalizeWeeklyLeagueLeaderboard(data);
}

function makeLeaderboardError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
