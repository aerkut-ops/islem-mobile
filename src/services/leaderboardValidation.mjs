const WEEK_KEY_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

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
