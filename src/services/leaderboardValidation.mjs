const WEEK_KEY_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const LEAGUE_KEYS = new Set([
  'bronze',
  'silver',
  'gold',
  'diamond',
  'mastery',
]);

export function validateWeekKey(value) {
  const weekKey = String(value || '').trim();
  return {
    error: WEEK_KEY_PATTERN.test(weekKey) ? null : 'invalid_week_key',
    weekKey,
  };
}

export function normalizeFriendLeaderboard(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row?.player_id && Number.isFinite(Number(row.score)))
    .map((row, index) => {
      const rankPosition = row.rank_position ?? row.position;
      return {
        display_name:
          typeof row.display_name === 'string' ? row.display_name : null,
        is_current_user: Boolean(row.is_current_user),
        player_id: row.player_id,
        position:
          Number.isInteger(Number(rankPosition)) && Number(rankPosition) > 0
            ? Number(rankPosition)
            : index + 1,
        score: Math.max(0, Math.trunc(Number(row.score))),
        username: typeof row.username === 'string' ? row.username : null,
      };
    })
    .sort((a, b) => a.position - b.position);
}

export function normalizeWeeklyLeagueLeaderboard(rows) {
  return (Array.isArray(rows) ? rows : [])
    .slice(0, 21)
    .map((row) => {
      const playerId = normalizeText(row?.player_id, 80);
      const username = normalizeText(row?.username, 24);
      const displayName = normalizeText(row?.display_name, 40);
      const leagueKey = normalizeText(row?.league_key, 20);
      const position = normalizePositiveInteger(row?.rank_position);
      const participantCount = normalizePositiveInteger(
        row?.participant_count,
      );
      const score = normalizeScore(row?.score);

      if (
        !playerId ||
        !LEAGUE_KEYS.has(leagueKey) ||
        !position ||
        !participantCount ||
        participantCount < position ||
        score == null
      ) {
        return null;
      }

      return {
        display_name: displayName,
        is_current_user: Boolean(row?.is_current_user),
        league_key: leagueKey,
        participant_count: participantCount,
        player_id: playerId,
        position,
        score,
        username,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.position - b.position);
}

function normalizeText(value, maxLength) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function normalizePositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function normalizeScore(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 2147483647
    ? Math.trunc(number)
    : null;
}
