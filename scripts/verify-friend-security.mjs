import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const TEST_CAPTCHA_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

const ACCOUNTS = [
  {
    email: 'islemappsupport+test@gmail.com',
    keychainService: 'islem-supabase-test-account',
    label: 'Development',
    username: 'islem_test_player',
  },
  {
    email: 'islemappsupport+appreview@gmail.com',
    keychainService: 'islem-app-review-account',
    label: 'App Review',
    username: 'islem_app_review',
  },
];

function parseEnvFile(path) {
  const values = {};
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) {
      continue;
    }
    const separator = line.indexOf('=');
    values[line.slice(0, separator).trim()] = line
      .slice(separator + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

function requireValue(value, name) {
  if (!value) {
    throw new Error(`${name} is missing from the local environment.`);
  }
  return value;
}

function getPassword(account) {
  try {
    return execFileSync(
      'security',
      [
        'find-generic-password',
        '-s',
        account.keychainService,
        '-a',
        account.email,
        '-w',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trimEnd();
  } catch {
    throw new Error(
      `${account.label} password is missing from macOS Keychain.`,
    );
  }
}

async function signIn(supabaseUrl, publishableKey, account) {
  const response = await fetch(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: account.email,
        password: getPassword(account),
        gotrue_meta_security: {
          captcha_token: TEST_CAPTCHA_TOKEN,
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `${account.label} sign-in failed with HTTP ${response.status}.`,
    );
  }

  const payload = await response.json();
  if (!payload.access_token || !payload.user?.id) {
    throw new Error(`${account.label} sign-in returned an incomplete session.`);
  }

  return {
    ...account,
    accessToken: payload.access_token,
    userId: payload.user.id,
  };
}

function authHeaders(publishableKey, session) {
  return {
    apikey: publishableKey,
    Authorization: `Bearer ${session.accessToken}`,
    'Content-Type': 'application/json',
  };
}

async function rpc({
  supabaseUrl,
  publishableKey,
  session,
  functionName,
  parameters = {},
}) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/rpc/${functionName}`,
    {
      method: 'POST',
      headers: authHeaders(publishableKey, session),
      body: JSON.stringify(parameters),
    },
  );

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // A failed request can have an empty body; status is checked below.
  }

  if (!response.ok) {
    throw new Error(
      `${session.label} ${functionName} failed with HTTP ${response.status}.`,
    );
  }

  return payload;
}

async function listConnections(context, session) {
  const rows = await rpc({
    ...context,
    session,
    functionName: 'list_friend_connections',
  });
  if (!Array.isArray(rows)) {
    throw new Error('Friend connections returned an unexpected response.');
  }
  return rows;
}

async function listWeeklyLeaderboard(context, session, weekKey) {
  const rows = await rpc({
    ...context,
    session,
    functionName: 'list_friend_weekly_leaderboard',
    parameters: { p_week_key: weekKey },
  });
  if (!Array.isArray(rows)) {
    throw new Error('Friend weekly leaderboard returned an unexpected response.');
  }
  return rows;
}

async function listFriendActivity(context, session, limit = 12) {
  const rows = await rpc({
    ...context,
    session,
    functionName: 'list_friend_activity',
    parameters: { p_limit: limit },
  });
  if (!Array.isArray(rows)) {
    throw new Error('Friend activity returned an unexpected response.');
  }
  return rows;
}

async function hasRecentCompletedEvent(context, session) {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const query = new URLSearchParams({
    select: 'id',
    completed: 'eq.true',
    played_at: `gte.${cutoff}`,
    limit: '1',
  });
  const response = await fetch(
    `${context.supabaseUrl}/rest/v1/score_events?${query.toString()}`,
    { headers: authHeaders(context.publishableKey, session) },
  );
  if (!response.ok) {
    throw new Error(
      `${session.label} score event lookup failed with HTTP ${response.status}.`,
    );
  }
  const rows = await response.json();
  return Array.isArray(rows) && rows.length > 0;
}

async function getIncomingRequestCount(context, session) {
  const count = await rpc({
    ...context,
    session,
    functionName: 'get_incoming_friend_request_count',
  });
  if (!Number.isInteger(count) || count < 0) {
    throw new Error('Incoming friend request count is invalid.');
  }
  return count;
}

async function listNotifications(context, session, limit = 30) {
  const rows = await rpc({
    ...context,
    session,
    functionName: 'list_user_notifications',
    parameters: { p_limit: limit },
  });
  if (!Array.isArray(rows)) {
    throw new Error('Notifications returned an unexpected response.');
  }
  return rows;
}

async function getUnreadNotificationCount(context, session) {
  const count = await rpc({
    ...context,
    session,
    functionName: 'get_unread_notification_count',
  });
  if (!Number.isInteger(count) || count < 0) {
    throw new Error('Unread notification count is invalid.');
  }
  return count;
}

async function dismissNotification(context, session, notificationId) {
  return rpc({
    ...context,
    session,
    functionName: 'dismiss_notification',
    parameters: { p_notification_id: notificationId },
  });
}

async function cleanupTestNotifications(context, sessions, entityIds) {
  for (const session of sessions) {
    const rows = await listNotifications(context, session, 50);
    for (const row of rows) {
      if (entityIds.has(row.entity_id)) {
        await dismissNotification(
          context,
          session,
          row.notification_id,
        );
      }
    }
  }
}

async function getFriendProfile(context, session, playerId) {
  const rows = await rpc({
    ...context,
    session,
    functionName: 'get_friend_profile',
    parameters: { p_player_id: playerId },
  });
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error('Friend profile returned an unexpected response.');
  }
  return rows[0];
}

async function assertFriendProfileDenied(context, session, playerId) {
  const response = await fetch(
    `${context.supabaseUrl}/rest/v1/rpc/get_friend_profile`,
    {
      method: 'POST',
      headers: authHeaders(context.publishableKey, session),
      body: JSON.stringify({ p_player_id: playerId }),
    },
  );
  if (![400, 401, 403].includes(response.status)) {
    throw new Error(
      `${session.label} can read a profile without an accepted friendship.`,
    );
  }
}

function getCurrentWeekKey() {
  const date = new Date();
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const calendarDay = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${calendarDay}`;
}

async function cleanTestRelationship(context, first, second) {
  const firstRows = await listConnections(context, first);
  const relation = firstRows.find((row) => row.player_id === second.userId);
  if (!relation) {
    return;
  }

  if (relation.connection_type === 'friend') {
    await rpc({
      ...context,
      session: first,
      functionName: 'remove_friend',
      parameters: { p_friend_user_id: second.userId },
    });
  } else if (relation.connection_type === 'outgoing') {
    await rpc({
      ...context,
      session: first,
      functionName: 'cancel_friend_request',
      parameters: { p_request_id: relation.request_id },
    });
  } else if (relation.connection_type === 'incoming') {
    await rpc({
      ...context,
      session: first,
      functionName: 'respond_friend_request',
      parameters: {
        p_accept: false,
        p_request_id: relation.request_id,
      },
    });
  }
}

async function assertDirectTablesDenied(context, session) {
  for (const table of [
    'friend_requests',
    'friendships',
    'user_notifications',
  ]) {
    const response = await fetch(
      `${context.supabaseUrl}/rest/v1/${table}?select=*`,
      {
        headers: authHeaders(context.publishableKey, session),
      },
    );
    if (![401, 403].includes(response.status)) {
      throw new Error(`Direct ${table} reads are not denied.`);
    }
  }
}

async function assertAnonymousRpcDenied(context) {
  for (const functionName of [
    'dismiss_notification',
    'get_friend_profile',
    'get_incoming_friend_request_count',
    'get_unread_notification_count',
    'list_friend_activity',
    'list_friend_connections',
    'list_friend_weekly_leaderboard',
    'list_user_notifications',
    'mark_notifications_read',
  ]) {
    const parameters = {
      dismiss_notification: { p_notification_id: null },
      get_friend_profile: { p_player_id: null },
      mark_notifications_read: { p_notification_ids: null },
    }[functionName] || {};
    const response = await fetch(
      `${context.supabaseUrl}/rest/v1/rpc/${functionName}`,
      {
        method: 'POST',
        headers: {
          apikey: context.publishableKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(parameters),
      },
    );
    if (![401, 403].includes(response.status)) {
      throw new Error(`Anonymous ${functionName} access was not denied.`);
    }
  }
}

async function main() {
  const fileEnv = parseEnvFile(new URL('../.env', import.meta.url));
  const context = {
    supabaseUrl: requireValue(
      process.env.EXPO_PUBLIC_SUPABASE_URL ??
        fileEnv.EXPO_PUBLIC_SUPABASE_URL,
      'EXPO_PUBLIC_SUPABASE_URL',
    ).replace(/\/+$/, ''),
    publishableKey: requireValue(
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
        fileEnv.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    ),
  };

  const sessions = [];
  for (const account of ACCOUNTS) {
    sessions.push(
      await signIn(context.supabaseUrl, context.publishableKey, account),
    );
  }
  const [development, appReview] = sessions;
  const weekKey = getCurrentWeekKey();

  if (development.userId === appReview.userId) {
    throw new Error('The two test accounts resolved to the same user.');
  }

  await cleanTestRelationship(context, development, appReview);
  const testEntityIds = new Set();

  try {
    const initialIncomingCount = await getIncomingRequestCount(
      context,
      appReview,
    );
    const initialAppReviewUnread = await getUnreadNotificationCount(
      context,
      appReview,
    );
    const initialDevelopmentUnread = await getUnreadNotificationCount(
      context,
      development,
    );
    const privateActivity = await listFriendActivity(context, development);
    if (privateActivity.some((row) => row.player_id === appReview.userId)) {
      throw new Error('Non-friend activity is visible.');
    }
    await assertFriendProfileDenied(
      context,
      development,
      appReview.userId,
    );
    console.log('PASS  Non-friend profile access is denied.');
    console.log('PASS  Non-friend activity remains hidden.');

    const privateLeaderboard = await listWeeklyLeaderboard(
      context,
      development,
      weekKey,
    );
    if (
      !privateLeaderboard.some(
        (row) =>
          row.player_id === development.userId && row.is_current_user === true,
      ) ||
      privateLeaderboard.some((row) => row.player_id === appReview.userId)
    ) {
      throw new Error('Non-friend weekly scores are visible.');
    }
    console.log('PASS  Weekly scores remain hidden before friendship.');

    const searchRows = await rpc({
      ...context,
      session: development,
      functionName: 'search_players',
      parameters: { p_limit: 20, p_query: appReview.username },
    });
    const match = searchRows.find((row) => row.player_id === appReview.userId);
    if (
      !match ||
      match.username !== appReview.username ||
      match.connection_type !== 'none' ||
      'email' in match
    ) {
      throw new Error('Player search exposed unexpected data or relation state.');
    }
    console.log('PASS  Player search returns only safe public profile fields.');

    const sendResult = await rpc({
      ...context,
      session: development,
      functionName: 'send_friend_request',
      parameters: { p_target_user_id: appReview.userId },
    });
    if (sendResult !== 'sent') {
      throw new Error(`Friend request returned ${String(sendResult)}.`);
    }
    if (
      (await getIncomingRequestCount(context, appReview)) !==
      initialIncomingCount + 1
    ) {
      throw new Error('Incoming request count did not increase after sending.');
    }

    const duplicateResult = await rpc({
      ...context,
      session: development,
      functionName: 'send_friend_request',
      parameters: { p_target_user_id: appReview.userId },
    });
    if (duplicateResult !== 'already_sent') {
      throw new Error('Duplicate friend request was not handled safely.');
    }
    console.log('PASS  Friend requests are idempotent per player pair.');

    const outgoingRows = await listConnections(context, development);
    const outgoing = outgoingRows.find(
      (row) =>
        row.player_id === appReview.userId &&
        row.connection_type === 'outgoing',
    );
    if (!outgoing?.request_id) {
      throw new Error('Outgoing friend request is missing.');
    }
    testEntityIds.add(outgoing.request_id);

    const safeNotificationKeys = new Set([
      'actor_display_name',
      'actor_id',
      'actor_username',
      'created_at',
      'entity_id',
      'is_read',
      'notification_id',
      'notification_type',
    ]);
    const firstRequestNotifications = await listNotifications(
      context,
      appReview,
      50,
    );
    const firstRequestNotification = firstRequestNotifications.find(
      (row) =>
        row.entity_id === outgoing.request_id &&
        row.notification_type === 'friend_request',
    );
    if (
      !firstRequestNotification ||
      firstRequestNotification.actor_id !== development.userId ||
      firstRequestNotification.is_read ||
      Object.keys(firstRequestNotification).some(
        (key) => !safeNotificationKeys.has(key),
      )
    ) {
      throw new Error('Friend request notification is missing or unsafe.');
    }
    if (
      (await getUnreadNotificationCount(context, appReview)) !==
      initialAppReviewUnread + 1
    ) {
      throw new Error('Unread count did not increase after a friend request.');
    }
    console.log('PASS  Friend request creates one private safe notification.');

    const cancelResult = await rpc({
      ...context,
      session: development,
      functionName: 'cancel_friend_request',
      parameters: { p_request_id: outgoing.request_id },
    });
    if (cancelResult !== 'cancelled') {
      throw new Error('Friend request was not cancelled.');
    }
    if (
      (await getIncomingRequestCount(context, appReview)) !==
      initialIncomingCount
    ) {
      throw new Error('Incoming request count did not reset after cancelling.');
    }
    if (
      (await listNotifications(context, appReview, 50)).some(
        (row) => row.entity_id === outgoing.request_id,
      ) ||
      (await getUnreadNotificationCount(context, appReview)) !==
        initialAppReviewUnread
    ) {
      throw new Error('Cancelled request notification was not removed.');
    }

    await rpc({
      ...context,
      session: development,
      functionName: 'send_friend_request',
      parameters: { p_target_user_id: appReview.userId },
    });
    const declineRows = await listConnections(context, appReview);
    const requestToDecline = declineRows.find(
      (row) =>
        row.player_id === development.userId &&
        row.connection_type === 'incoming',
    );
    if (!requestToDecline?.request_id) {
      throw new Error('Request to decline is missing.');
    }
    testEntityIds.add(requestToDecline.request_id);
    const declineResult = await rpc({
      ...context,
      session: appReview,
      functionName: 'respond_friend_request',
      parameters: {
        p_accept: false,
        p_request_id: requestToDecline.request_id,
      },
    });
    if (declineResult !== 'declined') {
      throw new Error('Friend request was not declined.');
    }
    if (
      (await getIncomingRequestCount(context, appReview)) !==
      initialIncomingCount
    ) {
      throw new Error('Incoming request count did not reset after declining.');
    }
    if (
      (await listNotifications(context, appReview, 50)).some(
        (row) => row.entity_id === requestToDecline.request_id,
      )
    ) {
      throw new Error('Declined request notification was not removed.');
    }
    console.log('PASS  Friend requests can be cancelled and declined.');

    await rpc({
      ...context,
      session: development,
      functionName: 'send_friend_request',
      parameters: { p_target_user_id: appReview.userId },
    });
    const incomingRows = await listConnections(context, appReview);
    const incoming = incomingRows.find(
      (row) =>
        row.player_id === development.userId &&
        row.connection_type === 'incoming',
    );
    if (!incoming?.request_id || 'email' in incoming) {
      throw new Error('Incoming friend request is missing or exposes email.');
    }
    testEntityIds.add(incoming.request_id);

    const acceptResult = await rpc({
      ...context,
      session: appReview,
      functionName: 'respond_friend_request',
      parameters: {
        p_accept: true,
        p_request_id: incoming.request_id,
      },
    });
    if (acceptResult !== 'accepted') {
      throw new Error('Friend request was not accepted.');
    }
    if (
      (await getIncomingRequestCount(context, appReview)) !==
      initialIncomingCount
    ) {
      throw new Error('Incoming request count did not reset after accepting.');
    }
    console.log('PASS  Incoming request count follows request state.');

    const receiverNotifications = await listNotifications(
      context,
      appReview,
      50,
    );
    if (
      receiverNotifications.some(
        (row) => row.entity_id === incoming.request_id,
      )
    ) {
      throw new Error('Accepted request notification was not removed.');
    }

    const senderNotifications = await listNotifications(
      context,
      development,
      50,
    );
    const acceptedNotification = senderNotifications.find(
      (row) =>
        row.entity_id === incoming.request_id &&
        row.notification_type === 'friend_accepted',
    );
    if (
      !acceptedNotification ||
      acceptedNotification.actor_id !== appReview.userId ||
      acceptedNotification.is_read ||
      Object.keys(acceptedNotification).some(
        (key) => !safeNotificationKeys.has(key),
      )
    ) {
      throw new Error('Accepted request notification is missing or unsafe.');
    }
    if (
      (await getUnreadNotificationCount(context, development)) !==
      initialDevelopmentUnread + 1
    ) {
      throw new Error('Acceptance did not increase the sender unread count.');
    }

    const crossAccountDismiss = await dismissNotification(
      context,
      appReview,
      acceptedNotification.notification_id,
    );
    if (crossAccountDismiss !== false) {
      throw new Error('Another account could dismiss a private notification.');
    }

    const markedCount = await rpc({
      ...context,
      session: development,
      functionName: 'mark_notifications_read',
      parameters: {
        p_notification_ids: [acceptedNotification.notification_id],
      },
    });
    const readNotification = (
      await listNotifications(context, development, 50)
    ).find(
      (row) => row.notification_id === acceptedNotification.notification_id,
    );
    if (
      markedCount !== 1 ||
      !readNotification?.is_read ||
      (await getUnreadNotificationCount(context, development)) !==
        initialDevelopmentUnread
    ) {
      throw new Error('Notification read state was not scoped or persisted.');
    }
    console.log('PASS  Acceptance notifications are private and readable once.');

    for (const [session, other] of [
      [development, appReview],
      [appReview, development],
    ]) {
      const rows = await listConnections(context, session);
      if (
        !rows.some(
          (row) =>
            row.player_id === other.userId &&
            row.connection_type === 'friend',
        )
      ) {
        throw new Error(`${session.label} cannot see the accepted friendship.`);
      }
    }
    console.log('PASS  Accepted friendships are visible to both participants.');

    const safeProfileKeys = new Set([
      'best_score',
      'best_streak',
      'display_name',
      'games_completed',
      'player_id',
      'total_score',
      'username',
      'weekly_score',
    ]);
    for (const [session, other] of [
      [development, appReview],
      [appReview, development],
    ]) {
      const friendProfile = await getFriendProfile(
        context,
        session,
        other.userId,
      );
      if (
        friendProfile.player_id !== other.userId ||
        friendProfile.username !== other.username ||
        Object.keys(friendProfile).some((key) => !safeProfileKeys.has(key))
      ) {
        throw new Error(
          `${session.label} friend profile is incomplete or exposes private fields.`,
        );
      }
    }
    console.log('PASS  Friend profiles expose only safe aggregate fields.');

    const safeActivityKeys = new Set([
      'activity_id',
      'awarded_score',
      'difficulty',
      'display_name',
      'duration_seconds',
      'mode',
      'played_at',
      'player_id',
      'target_count',
      'targets_solved',
      'username',
    ]);
    for (const [session, other] of [
      [development, appReview],
      [appReview, development],
    ]) {
      const rows = await listFriendActivity(context, session, 999);
      if (
        rows.length > 20 ||
        rows.some(
          (row) =>
            row.player_id === session.userId ||
            Object.keys(row).some((key) => !safeActivityKeys.has(key)),
        )
      ) {
        throw new Error(
          `${session.label} friend activity is unbounded or exposes private fields.`,
        );
      }

      if (
        (await hasRecentCompletedEvent(context, other)) &&
        !rows.some((row) => row.player_id === other.userId)
      ) {
        throw new Error(
          `${session.label} cannot see the accepted friend's recent activity.`,
        );
      }
    }
    console.log('PASS  Friend activity exposes only safe recent summaries.');

    for (const [session, other] of [
      [development, appReview],
      [appReview, development],
    ]) {
      const rows = await listWeeklyLeaderboard(context, session, weekKey);
      const ownRow = rows.find((row) => row.player_id === session.userId);
      const friendRow = rows.find((row) => row.player_id === other.userId);
      if (
        !ownRow?.is_current_user ||
        !friendRow ||
        friendRow.is_current_user ||
        rows.some((row) => 'email' in row)
      ) {
        throw new Error(
          `${session.label} friend weekly leaderboard is incomplete or unsafe.`,
        );
      }
    }
    console.log('PASS  Friend weekly scores are visible only after acceptance.');

    await assertDirectTablesDenied(context, development);
    console.log('PASS  Direct friend table reads are denied.');

    await assertAnonymousRpcDenied(context);
    console.log('PASS  Anonymous friend RPC access is denied.');
  } finally {
    await cleanTestRelationship(context, development, appReview);
    await cleanupTestNotifications(context, sessions, testEntityIds);
  }

  const finalRows = await listConnections(context, development);
  if (finalRows.some((row) => row.player_id === appReview.userId)) {
    throw new Error('Security test did not clean up its test relationship.');
  }
  await assertFriendProfileDenied(context, development, appReview.userId);
  const finalActivity = await listFriendActivity(context, development);
  if (finalActivity.some((row) => row.player_id === appReview.userId)) {
    throw new Error('Removed friend is still visible in friend activity.');
  }

  const finalLeaderboard = await listWeeklyLeaderboard(
    context,
    development,
    weekKey,
  );
  if (finalLeaderboard.some((row) => row.player_id === appReview.userId)) {
    throw new Error('Removed friend is still visible in the weekly leaderboard.');
  }

  console.log('PASS  Friend security check completed and cleaned up test data.');
}

main().catch((error) => {
  console.error(`FAIL  ${error.message}`);
  process.exitCode = 1;
});
