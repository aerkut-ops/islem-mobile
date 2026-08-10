import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  dismissNotification,
  loadNotifications,
  loadUnreadNotificationCount,
  markNotificationsRead,
} from '../services/notificationService';

const CHALLENGE_DESTINATION_TYPES = new Set([
  'challenge_accepted',
  'challenge_ready',
  'challenge_started',
]);

const ACCOUNT_DESTINATION_TYPES = new Set([
  'moderation_profile_cleared',
]);

export default function NotificationPanel({
  configured,
  loading,
  onClose,
  onOpenAccount,
  onOpenChallenge,
  onOpenFriends,
  onUnreadCountChange,
  session,
  strings,
  visible,
}) {
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [actionId, setActionId] = useState('');

  const refreshNotifications = useCallback(async () => {
    if (!session?.user?.id) {
      return;
    }

    setNotificationsLoading(true);
    setErrorMessage('');
    try {
      const rows = await loadNotifications(50);
      setNotifications(rows);

      const unreadIds = rows
        .filter((notification) => !notification.is_read)
        .map((notification) => notification.notification_id);
      if (unreadIds.length > 0) {
        try {
          await markNotificationsRead(unreadIds);
          onUnreadCountChange?.(await loadUnreadNotificationCount());
        } catch {
          // Reading notifications must still work if the read receipt fails.
        }
      }
    } catch {
      setErrorMessage(strings.loadError);
    } finally {
      setNotificationsLoading(false);
    }
  }, [onUnreadCountChange, session?.user?.id, strings.loadError]);

  useEffect(() => {
    if (!visible) {
      setNotifications([]);
      setNotificationsLoading(false);
      setErrorMessage('');
      setActionId('');
      return;
    }

    if (configured && session?.user?.id) {
      refreshNotifications();
    }
  }, [
    configured,
    refreshNotifications,
    session?.user?.id,
    visible,
  ]);

  const handleDismiss = async (notificationId) => {
    setActionId(notificationId);
    try {
      await dismissNotification(notificationId);
      setNotifications((current) =>
        current.filter(
          (notification) =>
            notification.notification_id !== notificationId,
        ),
      );
      onUnreadCountChange?.(await loadUnreadNotificationCount());
    } catch {
      setErrorMessage(strings.actionError);
    } finally {
      setActionId('');
    }
  };

  const handleOpenFriends = () => {
    onClose();
    onOpenFriends();
  };

  const handleOpenChallenge = () => {
    onClose();
    onOpenChallenge();
  };

  const handleOpenAccount = () => {
    onClose();
    onOpenAccount();
  };

  if (!visible) {
    return null;
  }

  let content;
  if (loading) {
    content = <PanelState loading text={strings.loadingAccount} />;
  } else if (!configured) {
    content = (
      <PanelState
        actionLabel={strings.closeAction}
        onAction={onClose}
        text={strings.unavailableText}
        title={strings.unavailableTitle}
      />
    );
  } else if (!session) {
    content = (
      <PanelState
        actionLabel={strings.signIn}
        onAction={onOpenAccount}
        text={strings.accountRequiredText}
        title={strings.accountRequiredTitle}
      />
    );
  } else if (notificationsLoading) {
    content = <PanelState loading text={strings.loading} />;
  } else if (errorMessage && notifications.length === 0) {
    content = (
      <PanelState
        actionLabel={strings.retry}
        onAction={refreshNotifications}
        text={errorMessage}
      />
    );
  } else {
    content = (
      <ScrollView showsVerticalScrollIndicator={false}>
        {errorMessage ? (
          <View style={styles.inlineError}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}
        {notifications.length > 0 ? (
          notifications.map((notification) => (
            <NotificationRow
              busy={actionId === notification.notification_id}
              key={notification.notification_id}
              notification={notification}
              onDismiss={() =>
                handleDismiss(notification.notification_id)
              }
              onOpen={
                ACCOUNT_DESTINATION_TYPES.has(
                  notification.notification_type,
                )
                  ? handleOpenAccount
                  : CHALLENGE_DESTINATION_TYPES.has(
                  notification.notification_type,
                )
                  ? handleOpenChallenge
                  : handleOpenFriends
              }
              strings={strings}
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>{strings.emptyTitle}</Text>
            <Text style={styles.emptyText}>{strings.emptyText}</Text>
          </View>
        )}
      </ScrollView>
    );
  }

  return (
    <View style={styles.overlay}>
      <Pressable
        accessibilityRole="button"
        onPress={onClose}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.card}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>{strings.eyebrow}</Text>
            <Text style={styles.title}>{strings.title}</Text>
          </View>
          <Pressable
            accessibilityLabel={strings.close}
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [
              styles.closeButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>
        {content}
      </View>
    </View>
  );
}

function NotificationRow({
  busy,
  notification,
  onDismiss,
  onOpen,
  strings,
}) {
  const systemNotification = ACCOUNT_DESTINATION_TYPES.has(
    notification.notification_type,
  );
  const name = systemNotification
    ? strings.systemActor
    : notification.actor_display_name || `@${notification.actor_username}`;
  const message = {
    challenge_accepted: strings.challengeAccepted(name),
    challenge_invite: strings.challengeInvite(name),
    challenge_ready: strings.challengeReady(name),
    challenge_started: strings.challengeStarted(name),
    friend_accepted: strings.friendAccepted(name),
    friend_request: strings.friendRequest(name),
    moderation_profile_cleared: strings.moderationProfileCleared,
  }[notification.notification_type];
  const openLabel = ACCOUNT_DESTINATION_TYPES.has(
    notification.notification_type,
  )
    ? strings.openAccount
    : CHALLENGE_DESTINATION_TYPES.has(notification.notification_type)
      ? strings.openChallenge
      : strings.openFriends;

  return (
    <View style={styles.notificationRow}>
      <Pressable
        accessibilityLabel={`${message} ${openLabel}`}
        accessibilityRole="button"
        onPress={onOpen}
        style={({ pressed }) => [
          styles.notificationMain,
          pressed && styles.pressed,
        ]}
      >
        <View
          style={[
            styles.actorMark,
            !notification.is_read && styles.actorMarkUnread,
          ]}
        >
          <Text style={styles.actorMarkText}>
            {systemNotification ? '!' : name.slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View style={styles.notificationCopy}>
          <Text style={styles.notificationText}>{message}</Text>
          <View style={styles.notificationMetaRow}>
            <Text style={styles.notificationTime}>
              {formatNotificationAge(notification.created_at, strings)}
            </Text>
            {!notification.is_read ? (
              <Text style={styles.newLabel}>{strings.newLabel}</Text>
            ) : null}
          </View>
        </View>
      </Pressable>
      <Pressable
        accessibilityLabel={strings.dismiss}
        accessibilityRole="button"
        disabled={busy}
        onPress={onDismiss}
        style={({ pressed }) => [
          styles.dismissButton,
          busy && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        {busy ? (
          <ActivityIndicator color="#147b76" size="small" />
        ) : (
          <Text style={styles.dismissText}>×</Text>
        )}
      </Pressable>
    </View>
  );
}

function PanelState({
  actionLabel,
  loading = false,
  onAction,
  text,
  title,
}) {
  return (
    <View style={styles.panelState}>
      {loading ? <ActivityIndicator color="#1fa7a0" /> : null}
      {title ? <Text style={styles.stateTitle}>{title}</Text> : null}
      <Text style={styles.stateText}>{text}</Text>
      {actionLabel ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.primaryButtonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function formatNotificationAge(value, strings) {
  const elapsedMinutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 60000),
  );
  if (elapsedMinutes < 1) {
    return strings.now;
  }
  if (elapsedMinutes < 60) {
    return strings.minutesAgo(elapsedMinutes);
  }
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return strings.hoursAgo(elapsedHours);
  }
  return strings.daysAgo(Math.floor(elapsedHours / 24));
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(32, 36, 42, 0.42)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    padding: 14,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 74,
  },
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: '82%',
    maxWidth: 520,
    padding: 16,
    width: '100%',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  eyebrow: {
    color: '#147b76',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: '#20242a',
    fontSize: 24,
    fontWeight: '900',
    marginTop: 1,
  },
  closeButton: {
    alignItems: 'center',
    borderColor: '#d8e2e8',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  closeText: {
    color: '#20242a',
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 26,
  },
  notificationRow: {
    alignItems: 'center',
    borderTopColor: '#edf2f5',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 76,
    paddingVertical: 9,
  },
  notificationMain: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    minWidth: 0,
  },
  actorMark: {
    alignItems: 'center',
    backgroundColor: '#edf2f5',
    borderRadius: 8,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  actorMarkUnread: {
    backgroundColor: '#d9f5f2',
  },
  actorMarkText: {
    color: '#147b76',
    fontSize: 18,
    fontWeight: '900',
  },
  notificationCopy: {
    flex: 1,
    marginLeft: 10,
    minWidth: 0,
  },
  notificationText: {
    color: '#20242a',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  notificationMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    marginTop: 4,
  },
  notificationTime: {
    color: '#7d8790',
    fontSize: 10,
    fontWeight: '800',
  },
  newLabel: {
    color: '#147b76',
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  dismissButton: {
    alignItems: 'center',
    borderColor: '#d8e2e8',
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    height: 32,
    justifyContent: 'center',
    marginLeft: 8,
    width: 32,
  },
  dismissText: {
    color: '#68737d',
    fontSize: 19,
    fontWeight: '900',
    lineHeight: 21,
  },
  inlineError: {
    backgroundColor: '#fff4f2',
    borderRadius: 8,
    marginBottom: 8,
    padding: 10,
  },
  errorText: {
    color: '#b34b3f',
    fontSize: 12,
    fontWeight: '800',
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 52,
  },
  emptyTitle: {
    color: '#20242a',
    fontSize: 17,
    fontWeight: '900',
  },
  emptyText: {
    color: '#68737d',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 6,
    textAlign: 'center',
  },
  panelState: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 44,
  },
  stateTitle: {
    color: '#20242a',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 10,
    textAlign: 'center',
  },
  stateText: {
    color: '#68737d',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 7,
    textAlign: 'center',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#1fa7a0',
    borderRadius: 8,
    marginTop: 16,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.72,
  },
});
