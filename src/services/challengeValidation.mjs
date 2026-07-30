const INVITE_DIRECTIONS = new Set(['incoming', 'outgoing']);
const ROOM_STATUSES = new Set(['ready', 'active']);

function normalizeDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeRequiredText(value) {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : null;
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
  const expiresAt = normalizeDate(row?.expires_at);

  if (
    !roomId ||
    !inviteId ||
    !roomCode ||
    !puzzleSeed ||
    !ROOM_STATUSES.has(status) ||
    !opponentId ||
    !opponentUsername ||
    !createdAt ||
    !expiresAt
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
    expires_at: expiresAt,
  };
}

export function normalizeChallengeRooms(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map(normalizeChallengeRoom)
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
