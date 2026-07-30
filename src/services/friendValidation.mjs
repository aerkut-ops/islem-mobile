export const PLAYER_SEARCH_MIN_LENGTH = 2;
export const PLAYER_SEARCH_MAX_LENGTH = 40;

const CONNECTION_TYPES = new Set(['friend', 'incoming', 'outgoing']);

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
