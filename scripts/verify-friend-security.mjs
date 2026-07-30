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
  for (const table of ['friend_requests', 'friendships']) {
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
  const response = await fetch(
    `${context.supabaseUrl}/rest/v1/rpc/list_friend_connections`,
    {
      method: 'POST',
      headers: {
        apikey: context.publishableKey,
        'Content-Type': 'application/json',
      },
      body: '{}',
    },
  );
  if (![401, 403].includes(response.status)) {
    throw new Error('Anonymous friend connection access was not denied.');
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

  if (development.userId === appReview.userId) {
    throw new Error('The two test accounts resolved to the same user.');
  }

  await cleanTestRelationship(context, development, appReview);

  try {
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

    const cancelResult = await rpc({
      ...context,
      session: development,
      functionName: 'cancel_friend_request',
      parameters: { p_request_id: outgoing.request_id },
    });
    if (cancelResult !== 'cancelled') {
      throw new Error('Friend request was not cancelled.');
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

    await assertDirectTablesDenied(context, development);
    console.log('PASS  Direct friend table reads are denied.');

    await assertAnonymousRpcDenied(context);
    console.log('PASS  Anonymous friend RPC access is denied.');
  } finally {
    await cleanTestRelationship(context, development, appReview);
  }

  const finalRows = await listConnections(context, development);
  if (finalRows.some((row) => row.player_id === appReview.userId)) {
    throw new Error('Security test did not clean up its test relationship.');
  }

  console.log('PASS  Friend security check completed and cleaned up test data.');
}

main().catch((error) => {
  console.error(`FAIL  ${error.message}`);
  process.exitCode = 1;
});
