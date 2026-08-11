const FRIEND_NOTIFICATION_TYPES = new Set([
  'friend_request',
  'friend_accepted',
  'challenge_invite',
]);

const CHALLENGE_NOTIFICATION_TYPES = new Set([
  'challenge_accepted',
  'challenge_ready',
  'challenge_started',
]);

const ACCOUNT_NOTIFICATION_TYPES = new Set([
  'moderation_profile_cleared',
]);

function normalizeBoundedString(value, maxLength = 100) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    return null;
  }
  return normalized;
}

export function normalizePushAction(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }

  const type = normalizeBoundedString(data.type, 40);
  if (
    !FRIEND_NOTIFICATION_TYPES.has(type) &&
    !CHALLENGE_NOTIFICATION_TYPES.has(type) &&
    !ACCOUNT_NOTIFICATION_TYPES.has(type)
  ) {
    return null;
  }

  return {
    entityId: normalizeBoundedString(data.entityId),
    notificationId: normalizeBoundedString(data.notificationId),
    screen: ACCOUNT_NOTIFICATION_TYPES.has(type)
      ? 'account'
      : CHALLENGE_NOTIFICATION_TYPES.has(type)
        ? 'challenge'
        : 'friends',
    type,
  };
}

export function pushActionFromNotification(notification) {
  return normalizePushAction(notification?.request?.content?.data);
}

export function pushActionFromResponse(response) {
  return pushActionFromNotification(response?.notification);
}
