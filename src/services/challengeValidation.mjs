const INVITE_DIRECTIONS = new Set(['incoming', 'outgoing']);
const ROOM_STATUSES = new Set(['ready', 'active', 'completed']);
const ROOM_OUTCOMES = new Set([
  'racing',
  'waiting_for_opponent',
  'won',
  'lost',
  'tie',
]);
const HISTORY_OUTCOMES = new Set(['won', 'lost', 'tie']);

function normalizeDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeOptionalDate(value) {
  if (value == null) {
    return null;
  }
  return normalizeDate(value) || undefined;
}

function normalizeRequiredText(value) {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : null;
}

function normalizeInteger(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max
    ? value
    : null;
}

function normalizeOptionalInteger(value, min, max) {
  if (value == null) {
    return null;
  }
  return normalizeInteger(value, min, max) ?? undefined;
}

export function groupChallengeInvites(rows) {
  const grouped = {
    incoming: [],
    outgoing: [],
  };

  for (const row of Array.isArray(rows) ? rows : []) {
    const inviteId = normalizeRequiredText(row?.invite_id);
    const direction = normalizeRequiredText(row?.direction);
    const playerId = normalizeRequiredText(row?.player_id);
    const username = normalizeRequiredText(row?.username);
    const createdAt = normalizeDate(row?.created_at);
    const expiresAt = normalizeDate(row?.expires_at);

    if (
      !inviteId ||
      !INVITE_DIRECTIONS.has(direction) ||
      !playerId ||
      !username ||
      !createdAt ||
      !expiresAt
    ) {
      continue;
    }

    grouped[direction].push({
      invite_id: inviteId,
      direction,
      player_id: playerId,
      username,
      display_name: normalizeRequiredText(row?.display_name),
      created_at: createdAt,
      expires_at: expiresAt,
    });
  }

  return grouped;
}

export function normalizeChallengeRoom(row) {
  const roomId = normalizeRequiredText(row?.room_id);
  const inviteId = normalizeRequiredText(row?.invite_id);
  const roomCode = normalizeRequiredText(row?.room_code);
  const puzzleSeed = normalizeRequiredText(row?.puzzle_seed);
  const status = normalizeRequiredText(row?.status);
  const opponentId = normalizeRequiredText(row?.opponent_id);
  const opponentUsername = normalizeRequiredText(row?.opponent_username);
  const createdAt = normalizeDate(row?.created_at);
  const startedAt = normalizeOptionalDate(row?.started_at);
  const expiresAt = normalizeDate(row?.expires_at);
  const targetCount = normalizeInteger(row?.target_count, 1, 16);
  const ownSolvedTargets = normalizeInteger(
    row?.own_solved_targets,
    0,
    targetCount || 16,
  );
  const opponentSolvedTargets = normalizeInteger(
    row?.opponent_solved_targets,
    0,
    targetCount || 16,
  );
  const ownMoves = normalizeInteger(row?.own_moves, 0, 250);
  const opponentMoves = normalizeInteger(row?.opponent_moves, 0, 250);
  const ownScore = normalizeOptionalInteger(row?.own_score, 0, 100000);
  const opponentScore = normalizeOptionalInteger(
    row?.opponent_score,
    0,
    100000,
  );
  const ownCompletedAt = normalizeOptionalDate(row?.own_completed_at);
  const opponentCompletedAt = normalizeOptionalDate(
    row?.opponent_completed_at,
  );
  const outcome = normalizeRequiredText(row?.outcome);

  if (
    !roomId ||
    !inviteId ||
    !roomCode ||
    !puzzleSeed ||
    !ROOM_STATUSES.has(status) ||
    !opponentId ||
    !opponentUsername ||
    !createdAt ||
    !expiresAt ||
    !targetCount ||
    ownSolvedTargets == null ||
    opponentSolvedTargets == null ||
    ownMoves == null ||
    opponentMoves == null ||
    ownScore === undefined ||
    opponentScore === undefined ||
    ownCompletedAt === undefined ||
    opponentCompletedAt === undefined ||
    !ROOM_OUTCOMES.has(outcome) ||
    (status !== 'ready' && !startedAt) ||
    (status === 'completed' &&
      (!ownCompletedAt ||
        !opponentCompletedAt ||
        !['won', 'lost', 'tie'].includes(outcome))) ||
    (outcome === 'waiting_for_opponent' &&
      (!ownCompletedAt || opponentCompletedAt))
  ) {
    return null;
  }

  return {
    room_id: roomId,
    invite_id: inviteId,
    room_code: roomCode,
    puzzle_seed: puzzleSeed,
    status,
    is_host: row?.is_host === true,
    opponent_id: opponentId,
    opponent_username: opponentUsername,
    opponent_display_name: normalizeRequiredText(row?.opponent_display_name),
    created_at: createdAt,
    started_at: startedAt,
    expires_at: expiresAt,
    target_count: targetCount,
    own_ready: row?.own_ready === true,
    opponent_ready: row?.opponent_ready === true,
    own_solved_targets: ownSolvedTargets,
    opponent_solved_targets: opponentSolvedTargets,
    own_moves: ownMoves,
    opponent_moves: opponentMoves,
    own_score: ownScore,
    opponent_score: opponentScore,
    own_completed_at: ownCompletedAt,
    opponent_completed_at: opponentCompletedAt,
    outcome,
  };
}

export function normalizeChallengeRooms(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map(normalizeChallengeRoom)
    .filter(Boolean);
}

export function normalizeChallengeHistoryEntry(row) {
  const roomId = normalizeRequiredText(row?.room_id);
  const opponentId = normalizeRequiredText(row?.opponent_id);
  const opponentUsername = normalizeRequiredText(row?.opponent_username);
  const outcome = normalizeRequiredText(row?.outcome);
  const ownScore = normalizeInteger(row?.own_score, 0, 100000);
  const opponentScore = normalizeInteger(row?.opponent_score, 0, 100000);
  const ownMoves = normalizeInteger(row?.own_moves, 1, 250);
  const opponentMoves = normalizeInteger(row?.opponent_moves, 1, 250);
  const ownDurationSeconds = normalizeInteger(
    row?.own_duration_seconds,
    0,
    604800,
  );
  const opponentDurationSeconds = normalizeInteger(
    row?.opponent_duration_seconds,
    0,
    604800,
  );
  const targetCount = normalizeInteger(row?.target_count, 1, 16);
  const completedAt = normalizeDate(row?.completed_at);

  if (
    !roomId ||
    !opponentId ||
    !opponentUsername ||
    !HISTORY_OUTCOMES.has(outcome) ||
    ownScore == null ||
    opponentScore == null ||
    ownMoves == null ||
    opponentMoves == null ||
    ownDurationSeconds == null ||
    opponentDurationSeconds == null ||
    targetCount == null ||
    !completedAt
  ) {
    return null;
  }

  return {
    room_id: roomId,
    opponent_id: opponentId,
    opponent_username: opponentUsername,
    opponent_display_name: normalizeRequiredText(row?.opponent_display_name),
    outcome,
    own_score: ownScore,
    opponent_score: opponentScore,
    own_moves: ownMoves,
    opponent_moves: opponentMoves,
    own_duration_seconds: ownDurationSeconds,
    opponent_duration_seconds: opponentDurationSeconds,
    target_count: targetCount,
    completed_at: completedAt,
  };
}

export function normalizeChallengeHistory(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map(normalizeChallengeHistoryEntry)
    .filter(Boolean);
}

export function normalizeChallengeResponse(value) {
  const result = normalizeRequiredText(value?.result);
  if (!result) {
    return { result: 'unknown', room: null };
  }

  return {
    result,
    room: value?.room || null,
  };
}
