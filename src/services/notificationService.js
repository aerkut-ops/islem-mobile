import {
  normalizeNotificationIds,
  normalizeNotificationLimit,
  normalizeNotifications,
  normalizeUnreadNotificationCount,
} from './notificationValidation.mjs';
import { isSupabaseConfigured, supabase } from './supabaseClient';

export async function loadNotifications(limit = 30) {
  requireNotificationService();

  const { data, error } = await supabase.rpc('list_user_notifications', {
    p_limit: normalizeNotificationLimit(limit),
  });
  if (error) {
    throw error;
  }

  return normalizeNotifications(data);
}

export async function loadUnreadNotificationCount() {
  requireNotificationService();

  const { data, error } = await supabase.rpc(
    'get_unread_notification_count',
  );
  if (error) {
    throw error;
  }

  return normalizeUnreadNotificationCount(data);
}

export async function markNotificationsRead(notificationIds) {
  requireNotificationService();

  const normalizedIds = normalizeNotificationIds(notificationIds);
  if (normalizedIds.length === 0) {
    return 0;
  }

  const { data, error } = await supabase.rpc('mark_notifications_read', {
    p_notification_ids: normalizedIds,
  });
  if (error) {
    throw error;
  }

  return normalizeUnreadNotificationCount(data);
}

export async function dismissNotification(notificationId) {
  requireNotificationService();

  const normalizedId =
    typeof notificationId === 'string' ? notificationId.trim() : '';
  if (!normalizedId) {
    throw makeNotificationError('invalid_notification');
  }

  const { data, error } = await supabase.rpc('dismiss_notification', {
    p_notification_id: normalizedId,
  });
  if (error) {
    throw error;
  }
  return data === true;
}

function requireNotificationService() {
  if (!isSupabaseConfigured || !supabase) {
    throw makeNotificationError('notifications_unavailable');
  }
}

function makeNotificationError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
