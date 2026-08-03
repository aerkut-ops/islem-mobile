import {
  groupFriendConnections,
  normalizeFriendActivity,
  normalizeFriendActivityLimit,
  normalizeFriendProfile,
  normalizeBlockedPlayers,
  normalizeIncomingFriendRequestCount,
  normalizePlayerReportReason,
  validatePlayerSearch,
} from './friendValidation.mjs';
import { isSupabaseConfigured, supabase } from './supabaseClient';

export async function loadFriendConnections() {
  requireFriendService();

  const { data, error } = await supabase.rpc('list_friend_connections');
  if (error) {
    throw error;
  }

  return groupFriendConnections(data);
}

export async function loadBlockedPlayers() {
  requireFriendService();

  const { data, error } = await supabase.rpc('list_blocked_players');
  if (error) {
    throw error;
  }

  return normalizeBlockedPlayers(data);
}

export async function loadFriendActivity(limit = 12) {
  requireFriendService();

  const { data, error } = await supabase.rpc('list_friend_activity', {
    p_limit: normalizeFriendActivityLimit(limit),
  });
  if (error) {
    throw error;
  }

  return normalizeFriendActivity(data);
}

export async function loadFriendProfile(playerId) {
  requireFriendService();

  const { data, error } = await supabase.rpc('get_friend_profile', {
    p_player_id: playerId,
  });
  if (error) {
    throw error;
  }

  const profile = normalizeFriendProfile(Array.isArray(data) ? data[0] : data);
  if (!profile) {
    throw makeFriendError('friend_profile_unavailable');
  }
  return profile;
}

export async function loadIncomingFriendRequestCount() {
  requireFriendService();

  const { data, error } = await supabase.rpc(
    'get_incoming_friend_request_count',
  );
  if (error) {
    throw error;
  }

  return normalizeIncomingFriendRequestCount(data);
}

export async function searchPlayers(searchText) {
  requireFriendService();

  const validated = validatePlayerSearch(searchText);
  if (validated.error) {
    throw makeFriendError(validated.error);
  }

  const { data, error } = await supabase.rpc('search_players', {
    p_limit: 20,
    p_query: validated.query,
  });
  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

export async function sendFriendRequest(playerId) {
  return runFriendAction('send_friend_request', {
    p_target_user_id: playerId,
  });
}

export async function respondFriendRequest(requestId, accept) {
  return runFriendAction('respond_friend_request', {
    p_accept: Boolean(accept),
    p_request_id: requestId,
  });
}

export async function cancelFriendRequest(requestId) {
  return runFriendAction('cancel_friend_request', {
    p_request_id: requestId,
  });
}

export async function removeFriend(playerId) {
  return runFriendAction('remove_friend', {
    p_friend_user_id: playerId,
  });
}

export async function blockPlayer(playerId) {
  return runFriendAction('block_player', {
    p_target_user_id: playerId,
  });
}

export async function unblockPlayer(playerId) {
  return runFriendAction('unblock_player', {
    p_target_user_id: playerId,
  });
}

export async function reportPlayer(playerId, reason) {
  const normalizedReason = normalizePlayerReportReason(reason);
  if (!normalizedReason) {
    throw makeFriendError('invalid_report_reason');
  }

  return runFriendAction('report_player', {
    p_reason: normalizedReason,
    p_target_user_id: playerId,
  });
}

async function runFriendAction(functionName, parameters) {
  requireFriendService();

  const { data, error } = await supabase.rpc(functionName, parameters);
  if (error) {
    throw error;
  }
  return data;
}

function requireFriendService() {
  if (!isSupabaseConfigured || !supabase) {
    throw makeFriendError('friends_unavailable');
  }
}

function makeFriendError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
