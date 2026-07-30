const NOTIFICATION_TYPES = new Set([
  'friend_request',
  'friend_accepted',
  'challenge_invite',
  'challenge_accepted',
]);

function normalizeNonNegativeInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }
  return Math.max(0, Math.floor(number));
}

export function normalizeNotificationLimit(value) {
  const limit = normalizeNonNegativeInteger(value);
  return Math.min(Math.max(limit || 30, 1), 50);
}

export function normalizeUnreadNotificationCount(value) {
  return normalizeNonNegativeInteger(value);
}

export function normalizeNotificationIds(values) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .filter((value) => typeof value === 'string' && value.length > 0)
        .slice(0, 50),
    ),
  ];
}

export function normalizeNotifications(rows) {
  const notifications = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    const createdAt = new Date(row?.created_at);
    if (
      !row?.notification_id ||
      !row?.actor_id ||
      !row?.actor_username ||
      !row?.entity_id ||
      !NOTIFICATION_TYPES.has(row.notification_type) ||
      Number.isNaN(createdAt.getTime())
    ) {
      continue;
    }

    notifications.push({
      notification_id: String(row.notification_id),
      notification_type: row.notification_type,
      actor_id: String(row.actor_id),
      actor_username: String(row.actor_username),
      actor_display_name: row.actor_display_name
        ? String(row.actor_display_name)
        : null,
      entity_id: String(row.entity_id),
      is_read: row.is_read === true,
      created_at: createdAt.toISOString(),
    });
  }

  return notifications.sort(
    (left, right) =>
      new Date(right.created_at).getTime() -
      new Date(left.created_at).getTime(),
  );
}
