const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MODERATOR_ROLES = new Set(['moderator', 'owner']);
const REPORT_REASONS = new Set([
  'inappropriate_profile',
  'harassment',
  'spam_cheating',
  'other',
]);
const REPORT_STATUSES = new Set([
  'pending',
  'reviewing',
  'resolved',
  'dismissed',
]);
const MODERATION_ACTIONS = new Set(['review', 'resolve', 'dismiss']);
const MODERATION_RESOLUTIONS = new Set([
  'profile_cleared',
  'handled_externally',
  'no_violation',
  'duplicate',
]);

export function normalizeModeratorRole(value) {
  const role = normalizeCode(value, 20);
  return MODERATOR_ROLES.has(role) ? role : null;
}

export function normalizeReportStatus(value) {
  const status = normalizeCode(value, 20) || 'pending';
  return REPORT_STATUSES.has(status) ? status : 'pending';
}

export function normalizeModerationLimit(value) {
  const limit = Number(value);
  return Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 50;
}

export function normalizePlayerReports(rows) {
  return (Array.isArray(rows) ? rows : [])
    .slice(0, 100)
    .map((row) => {
      const reportId = normalizeUuid(row?.report_id);
      const playerId = normalizeUuid(row?.reported_player_id);
      const username = normalizeText(row?.username_snapshot, 24);
      const displayName = normalizeText(row?.display_name_snapshot, 40);
      const reason = normalizeCode(row?.reason, 40);
      const status = normalizeCode(row?.status, 20);
      const createdAt = normalizeDate(row?.created_at);
      const reviewedAt = row?.reviewed_at
        ? normalizeDate(row.reviewed_at)
        : null;
      const resolution = row?.resolution
        ? normalizeCode(row.resolution, 40)
        : null;
      const relatedOpenReports = normalizeNonNegativeInteger(
        row?.related_open_reports,
      );

      if (
        !reportId ||
        !playerId ||
        !username ||
        !REPORT_REASONS.has(reason) ||
        !REPORT_STATUSES.has(status) ||
        !createdAt ||
        (row?.reviewed_at && !reviewedAt) ||
        (resolution && !MODERATION_RESOLUTIONS.has(resolution))
      ) {
        return null;
      }

      return {
        created_at: createdAt,
        display_name_snapshot: displayName,
        reason,
        related_open_reports: relatedOpenReports,
        report_id: reportId,
        reported_player_id: playerId,
        resolution,
        reviewed_at: reviewedAt,
        status,
        username_snapshot: username,
      };
    })
    .filter(Boolean);
}

export function normalizePlayerReportActions(rows) {
  return (Array.isArray(rows) ? rows : [])
    .slice(0, 100)
    .map((row) => {
      const actionId = normalizePositiveInteger(row?.action_id);
      const action = normalizeCode(row?.action, 20);
      const previousStatus = normalizeCode(row?.previous_status, 20);
      const nextStatus = normalizeCode(row?.next_status, 20);
      const resolution = row?.resolution
        ? normalizeCode(row.resolution, 40)
        : null;
      const moderatorRole = normalizeCode(row?.moderator_role, 30);
      const createdAt = normalizeDate(row?.created_at);

      if (
        !actionId ||
        !MODERATION_ACTIONS.has(action) ||
        !REPORT_STATUSES.has(previousStatus) ||
        !REPORT_STATUSES.has(nextStatus) ||
        (resolution && !MODERATION_RESOLUTIONS.has(resolution)) ||
        !moderatorRole ||
        !createdAt
      ) {
        return null;
      }

      return {
        action,
        action_id: actionId,
        created_at: createdAt,
        moderator_role: moderatorRole,
        next_status: nextStatus,
        previous_status: previousStatus,
        resolution,
      };
    })
    .filter(Boolean);
}

export function validateModerationDecision(action, resolution = null) {
  const normalizedAction = normalizeCode(action, 20);
  const normalizedResolution = resolution
    ? normalizeCode(resolution, 40)
    : null;

  let valid = normalizedAction === 'review' && !normalizedResolution;
  if (normalizedAction === 'resolve') {
    valid = new Set(['profile_cleared', 'handled_externally']).has(
      normalizedResolution,
    );
  }
  if (normalizedAction === 'dismiss') {
    valid = new Set(['no_violation', 'duplicate']).has(
      normalizedResolution,
    );
  }

  return valid
    ? { action: normalizedAction, error: null, resolution: normalizedResolution }
    : { action: normalizedAction, error: 'invalid_moderation_decision', resolution: normalizedResolution };
}

function normalizeUuid(value) {
  const normalized = normalizeText(value, 80);
  return normalized && UUID_PATTERN.test(normalized) ? normalized : null;
}

function normalizeText(value, maxLength) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function normalizeCode(value, maxLength) {
  const normalized = normalizeText(value, maxLength);
  return normalized ? normalized.toLowerCase() : null;
}

function normalizeDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizePositiveInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function normalizeNonNegativeInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}
