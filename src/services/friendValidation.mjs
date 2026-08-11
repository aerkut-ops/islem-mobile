export const PLAYER_SEARCH_MIN_LENGTH = 2;
export const PLAYER_SEARCH_MAX_LENGTH = 40;
export const PLAYER_REPORT_REASONS = Object.freeze([
  'inappropriate_profile',
  'harassment',
  'spam_cheating',
  'other',
]);

const CONNECTION_TYPES = new Set(['friend', 'incoming', 'outgoing']);
const ACTIVITY_MODES = new Set(['normal', 'daily', 'weekly']);
const ACTIVITY_DIFFICULTIES = new Set([
  'paper',
  'easy',
  'medium',
  'hard',
  'master',
  'weekly',
]);

export function normalizePlayerSearch(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '');
}

export function validatePlayerSearch(value) {
  const query = normalizePlayerSearch(value);
  if (
    query.length < PLAYER_SEARCH_MIN_LENGTH ||
    query.length > PLAYER_SEARCH_MAX_LENGTH
  ) {
    return { error: 'invalid_search', query };
  }
  return { error: null, query };
}

export function normalizePlayerReportReason(value) {
  const reason = String(value || '').trim().toLowerCase();
  return PLAYER_REPORT_REASONS.includes(reason) ? reason : null;
}

export function groupFriendConnections(rows) {
  const grouped = {
    friends: [],
    incoming: [],
    outgoing: [],
  };

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row?.player_id || !CONNECTION_TYPES.has(row.connection_type)) {
      continue;
    }
    if (row.connection_type === 'friend') {
      grouped.friends.push(row);
    } else {
      grouped[row.connection_type].push(row);
    }
  }

  return grouped;
}

function normalizeNonNegativeInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }
  return Math.max(0, Math.floor(number));
}

export function normalizeFriendProfile(row) {
  if (!row?.player_id || !row?.username) {
    return null;
  }

  return {
    player_id: row.player_id,
    username: String(row.username),
    display_name: row.display_name ? String(row.display_name) : null,
    total_score: normalizeNonNegativeInteger(row.total_score),
    best_score: normalizeNonNegativeInteger(row.best_score),
    games_completed: normalizeNonNegativeInteger(row.games_completed),
    best_streak: normalizeNonNegativeInteger(row.best_streak),
    weekly_score: normalizeNonNegativeInteger(row.weekly_score),
  };
}

export function normalizeIncomingFriendRequestCount(value) {
  return normalizeNonNegativeInteger(value);
}

export function normalizeBlockedPlayers(rows) {
  const blockedPlayers = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    const blockedAt = new Date(row?.blocked_at);
    if (
      !row?.player_id ||
      !row?.username ||
      Number.isNaN(blockedAt.getTime())
    ) {
      continue;
    }

    blockedPlayers.push({
      player_id: row.player_id,
      username: String(row.username),
      display_name: row.display_name ? String(row.display_name) : null,
      blocked_at: blockedAt.toISOString(),
    });
  }

  return blockedPlayers.sort(
    (left, right) =>
      new Date(right.blocked_at).getTime() -
      new Date(left.blocked_at).getTime(),
  );
}

export function normalizeFriendActivityLimit(value) {
  const limit = normalizeNonNegativeInteger(value);
  return Math.min(Math.max(limit || 12, 1), 20);
}

export function normalizeFriendActivity(rows) {
  const activities = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    const playedAt = new Date(row?.played_at);
    if (
      !row?.activity_id ||
      !row?.player_id ||
      !row?.username ||
      !ACTIVITY_MODES.has(row.mode) ||
      !ACTIVITY_DIFFICULTIES.has(row.difficulty) ||
      Number.isNaN(playedAt.getTime())
    ) {
      continue;
    }

    activities.push({
      activity_id: row.activity_id,
      player_id: row.player_id,
      username: String(row.username),
      display_name: row.display_name ? String(row.display_name) : null,
      mode: row.mode,
      difficulty: row.difficulty,
      awarded_score: normalizeNonNegativeInteger(row.awarded_score),
      targets_solved: normalizeNonNegativeInteger(row.targets_solved),
      target_count: normalizeNonNegativeInteger(row.target_count),
      duration_seconds: normalizeNonNegativeInteger(row.duration_seconds),
      played_at: playedAt.toISOString(),
    });
  }

  return activities.sort(
    (left, right) =>
      new Date(right.played_at).getTime() -
      new Date(left.played_at).getTime(),
  );
}
