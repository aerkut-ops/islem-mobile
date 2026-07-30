import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const TEST_CAPTCHA_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';
const SAFE_INVITE_KEYS = new Set([
  'created_at',
  'direction',
  'display_name',
  'expires_at',
  'invite_id',
  'player_id',
  'username',
]);
const SAFE_ROOM_KEYS = new Set([
  'created_at',
  'expires_at',
  'invite_id',
  'is_host',
  'opponent_display_name',
  'opponent_id',
  'opponent_username',
  'puzzle_seed',
  'room_code',
  'room_id',
  'status',
]);
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
    throw new Error(`${account.label} password is missing from Keychain.`);
  }
}

async function signIn(context, account) {
  const response = await fetch(
    `${context.supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        apikey: context.publishableKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: account.email,
        password: getPassword(account),
        gotrue_meta_security: { captcha_token: TEST_CAPTCHA_TOKEN },
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`${account.label} sign-in failed (${response.status}).`);
  }
  const payload = await response.json();
  return {
    ...account,
    accessToken: payload.access_token,
    userId: payload.user.id,
  };
}

function headers(context, session = null) {
  return {
    apikey: context.publishableKey,
    ...(session
      ? { Authorization: `Bearer ${session.accessToken}` }
      : {}),
    'Content-Type': 'application/json',
  };
}

async function rawRpc(
  context,
  session,
  functionName,
  parameters = {},
) {
  const response = await fetch(
    `${context.supabaseUrl}/rest/v1/rpc/${functionName}`,
    {
      method: 'POST',
      headers: headers(context, session),
      body: JSON.stringify(parameters),
    },
  );
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Status is authoritative when PostgREST returns an empty error body.
  }
  return { payload, response };
}

async function rpc(context, session, functionName, parameters = {}) {
  const result = await rawRpc(
    context,
    session,
    functionName,
    parameters,
  );
  if (!result.response.ok) {
    const detail =
      typeof result.payload?.message === 'string'
        ? ` ${result.payload.message}`
        : '';
    throw new Error(
      `${session.label} ${functionName} failed (${result.response.status}).${detail}`,
    );
  }
  return result.payload;
}

async function listConnections(context, session) {
  return rpc(context, session, 'list_friend_connections');
}

async function ensureNoFriendship(context, first, second) {
  const relation = (await listConnections(context, first)).find(
    (row) => row.player_id === second.userId,
  );
  if (!relation) {
    return;
  }
  if (relation.connection_type === 'friend') {
    await rpc(context, first, 'remove_friend', {
      p_friend_user_id: second.userId,
    });
  } else if (relation.connection_type === 'outgoing') {
    await rpc(context, first, 'cancel_friend_request', {
      p_request_id: relation.request_id,
    });
  } else {
    await rpc(context, first, 'respond_friend_request', {
      p_accept: false,
      p_request_id: relation.request_id,
    });
  }
}

async function ensureFriendship(context, first, second) {
  const firstRows = await listConnections(context, first);
  const relation = firstRows.find((row) => row.player_id === second.userId);
  if (relation?.connection_type === 'friend') {
    return;
  }
  if (relation?.connection_type === 'incoming') {
    await rpc(context, first, 'respond_friend_request', {
      p_accept: true,
      p_request_id: relation.request_id,
    });
    return;
  }
  if (!relation) {
    await rpc(context, first, 'send_friend_request', {
      p_target_user_id: second.userId,
    });
  }
  const incoming = (await listConnections(context, second)).find(
    (row) =>
      row.player_id === first.userId &&
      row.connection_type === 'incoming',
  );
  if (!incoming?.request_id) {
    throw new Error('Could not establish the test friendship.');
  }
  await rpc(context, second, 'respond_friend_request', {
    p_accept: true,
    p_request_id: incoming.request_id,
  });
}

async function cleanupChallenges(context, sessions) {
  for (const session of sessions) {
    const rooms = await rpc(
      context,
      session,
      'list_active_challenge_rooms',
    );
    for (const room of rooms) {
      await rpc(context, session, 'cancel_challenge_room', {
        p_room_id: room.room_id,
      });
    }
  }
  for (const session of sessions) {
    const invites = await rpc(context, session, 'list_challenge_invites');
    for (const invite of invites) {
      if (invite.direction === 'outgoing') {
        await rpc(context, session, 'cancel_challenge_invite', {
          p_invite_id: invite.invite_id,
        });
      } else {
        await rpc(context, session, 'respond_challenge_invite', {
          p_accept: false,
          p_invite_id: invite.invite_id,
        });
      }
    }
  }
}

async function assertDirectReadsDenied(context, session) {
  for (const table of ['challenge_invites', 'challenge_rooms']) {
    const response = await fetch(
      `${context.supabaseUrl}/rest/v1/${table}?select=*`,
      { headers: headers(context, session) },
    );
    if (![401, 403].includes(response.status)) {
      throw new Error(`Direct ${table} read was not denied.`);
    }
  }
}

async function assertAnonymousRpcDenied(context) {
  const calls = [
    ['send_challenge_invite', { p_target_user_id: null }],
    ['list_challenge_invites', {}],
    [
      'respond_challenge_invite',
      { p_accept: false, p_invite_id: null },
    ],
    ['cancel_challenge_invite', { p_invite_id: null }],
    ['list_active_challenge_rooms', {}],
    ['cancel_challenge_room', { p_room_id: null }],
  ];
  for (const [functionName, parameters] of calls) {
    const { response } = await rawRpc(
      context,
      null,
      functionName,
      parameters,
    );
    if (![401, 403].includes(response.status)) {
      throw new Error(`Anonymous ${functionName} access was not denied.`);
    }
  }
}

async function main() {
  const env = parseEnvFile(new URL('../.env', import.meta.url));
  const context = {
    publishableKey:
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    supabaseUrl: (
      process.env.EXPO_PUBLIC_SUPABASE_URL ||
      env.EXPO_PUBLIC_SUPABASE_URL ||
      ''
    ).replace(/\/+$/, ''),
  };
  if (!context.publishableKey || !context.supabaseUrl) {
    throw new Error('Supabase public environment is incomplete.');
  }

  const [development, appReview] = await Promise.all(
    ACCOUNTS.map((account) => signIn(context, account)),
  );
  const sessions = [development, appReview];

  await cleanupChallenges(context, sessions);
  await ensureNoFriendship(context, development, appReview);

  const nonFriendAttempt = await rawRpc(
    context,
    development,
    'send_challenge_invite',
    { p_target_user_id: appReview.userId },
  );
  if (nonFriendAttempt.response.ok) {
    throw new Error('A non-friend could send a challenge invitation.');
  }
  console.log('PASS  Challenge invitations require an accepted friendship.');

  await ensureFriendship(context, development, appReview);
  await Promise.all([
    assertDirectReadsDenied(context, development),
    assertDirectReadsDenied(context, appReview),
    assertAnonymousRpcDenied(context),
  ]);
  console.log('PASS  Challenge tables and RPCs reject direct/anonymous access.');

  const sent = await rpc(context, development, 'send_challenge_invite', {
    p_target_user_id: appReview.userId,
  });
  if (sent !== 'sent') {
    throw new Error(`Unexpected initial invitation result: ${sent}.`);
  }
  const duplicate = await rpc(
    context,
    development,
    'send_challenge_invite',
    { p_target_user_id: appReview.userId },
  );
  const reverse = await rpc(context, appReview, 'send_challenge_invite', {
    p_target_user_id: development.userId,
  });
  if (duplicate !== 'already_sent' || reverse !== 'incoming_pending') {
    throw new Error('Pending invitation pair was not idempotent.');
  }

  const senderInvites = await rpc(
    context,
    development,
    'list_challenge_invites',
  );
  const receiverInvites = await rpc(
    context,
    appReview,
    'list_challenge_invites',
  );
  const outgoing = senderInvites.find(
    (row) =>
      row.player_id === appReview.userId &&
      row.direction === 'outgoing',
  );
  const incoming = receiverInvites.find(
    (row) =>
      row.player_id === development.userId &&
      row.direction === 'incoming',
  );
  if (
    !outgoing?.invite_id ||
    outgoing.invite_id !== incoming?.invite_id ||
    Object.keys(outgoing).some((key) => !SAFE_INVITE_KEYS.has(key)) ||
    Object.keys(incoming).some((key) => !SAFE_INVITE_KEYS.has(key))
  ) {
    throw new Error('Invitation lists are incomplete or expose private data.');
  }
  console.log('PASS  Challenge invitation state is idempotent and private.');

  const unauthorized = await rawRpc(
    context,
    development,
    'respond_challenge_invite',
    { p_accept: true, p_invite_id: outgoing.invite_id },
  );
  if (unauthorized.response.ok) {
    throw new Error('The challenge sender could accept their own invite.');
  }

  const accepted = await rpc(
    context,
    appReview,
    'respond_challenge_invite',
    { p_accept: true, p_invite_id: incoming.invite_id },
  );
  if (accepted?.result !== 'accepted') {
    throw new Error('Challenge invitation was not accepted.');
  }

  const [hostRooms, guestRooms] = await Promise.all([
    rpc(context, development, 'list_active_challenge_rooms'),
    rpc(context, appReview, 'list_active_challenge_rooms'),
  ]);
  const hostRoom = hostRooms[0];
  const guestRoom = guestRooms[0];
  if (
    !hostRoom?.room_id ||
    hostRoom.room_id !== guestRoom?.room_id ||
    hostRoom.room_code !== guestRoom.room_code ||
    !hostRoom.is_host ||
    guestRoom.is_host ||
    hostRoom.opponent_id !== appReview.userId ||
    guestRoom.opponent_id !== development.userId ||
    Object.keys(hostRoom).some((key) => !SAFE_ROOM_KEYS.has(key)) ||
    Object.keys(guestRoom).some((key) => !SAFE_ROOM_KEYS.has(key))
  ) {
    throw new Error('Accepted room is inconsistent or exposes private data.');
  }
  console.log('PASS  Both participants receive the same safe ready room.');

  const notifications = await rpc(
    context,
    development,
    'list_user_notifications',
    { p_limit: 50 },
  );
  if (
    !notifications.some(
      (row) =>
        row.notification_type === 'challenge_accepted' &&
        row.entity_id === hostRoom.room_id,
    )
  ) {
    throw new Error('Accepted challenge notification is missing.');
  }

  if (
    !(await rpc(context, development, 'cancel_challenge_room', {
      p_room_id: hostRoom.room_id,
    }))
  ) {
    throw new Error('Ready room could not be cancelled.');
  }
  if (
    (await rpc(context, appReview, 'list_active_challenge_rooms')).length
  ) {
    throw new Error('Cancelled room remained visible to the guest.');
  }

  await rpc(context, development, 'send_challenge_invite', {
    p_target_user_id: appReview.userId,
  });
  const declinedInvite = (
    await rpc(context, appReview, 'list_challenge_invites')
  ).find((row) => row.player_id === development.userId);
  const declined = await rpc(
    context,
    appReview,
    'respond_challenge_invite',
    { p_accept: false, p_invite_id: declinedInvite.invite_id },
  );
  if (declined?.result !== 'declined') {
    throw new Error('Challenge invitation could not be declined.');
  }

  await rpc(context, development, 'send_challenge_invite', {
    p_target_user_id: appReview.userId,
  });
  const cancellable = (
    await rpc(context, development, 'list_challenge_invites')
  ).find((row) => row.player_id === appReview.userId);
  if (
    (await rpc(context, development, 'cancel_challenge_invite', {
      p_invite_id: cancellable.invite_id,
    })) !== 'cancelled'
  ) {
    throw new Error('Challenge invitation could not be cancelled.');
  }
  console.log('PASS  Challenge decline, cancellation, and cleanup are consistent.');

  await cleanupChallenges(context, sessions);
  console.log('Challenge security verification passed.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
