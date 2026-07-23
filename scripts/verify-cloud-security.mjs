import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PRIVATE_TABLES = [
  { name: 'profiles', requireOwnRow: true },
  { name: 'player_stats', requireOwnRow: true },
  { name: 'daily_progress' },
  { name: 'score_events' },
  { name: 'achievement_unlocks' },
  { name: 'account_deletion_requests' },
];

const ACCOUNTS = [
  {
    label: 'Development',
    email: 'islemappsupport+test@gmail.com',
    keychainService: 'islem-supabase-test-account',
  },
  {
    label: 'App Review',
    email: 'islemappsupport+appreview@gmail.com',
    keychainService: 'islem-app-review-account',
  },
];

function parseEnvFile(path) {
  const values = {};

  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex < 1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function requireValue(value, name) {
  if (!value) {
    throw new Error(`${name} is missing. Add it to the local .env file.`);
  }
  return value;
}

function getKeychainPassword(account) {
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
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    ).trimEnd();
  } catch {
    throw new Error(
      `${account.label} password was not found in macOS Keychain (${account.keychainService}).`,
    );
  }
}

async function signIn({ supabaseUrl, publishableKey, account }) {
  const password = getKeychainPassword(account);
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
        password,
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
    label: account.label,
    accessToken: payload.access_token,
    userId: payload.user.id,
  };
}

async function selectUserIds({
  supabaseUrl,
  publishableKey,
  accessToken,
  table,
  userId,
  allowDenied = false,
}) {
  const query = new URLSearchParams({ select: 'user_id' });
  if (userId) {
    query.set('user_id', `eq.${userId}`);
  }

  const headers = { apikey: publishableKey };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/${table}?${query.toString()}`,
    { headers },
  );

  if (allowDenied && (response.status === 401 || response.status === 403)) {
    return { denied: true, rows: [] };
  }

  if (!response.ok) {
    throw new Error(`${table} read failed with HTTP ${response.status}.`);
  }

  const rows = await response.json();
  if (!Array.isArray(rows)) {
    throw new Error(`${table} returned an unexpected response.`);
  }

  return { denied: false, rows };
}

function assertOwnRows({ label, table, rows, userId, requireOwnRow }) {
  if (rows.some((row) => row.user_id !== userId)) {
    throw new Error(`${label} can read another user's ${table} rows.`);
  }

  if (requireOwnRow && rows.length !== 1) {
    throw new Error(
      `${label} should read exactly one own ${table} row, received ${rows.length}.`,
    );
  }
}

async function verifyAccountIsolation({
  supabaseUrl,
  publishableKey,
  session,
  otherUserId,
}) {
  for (const table of PRIVATE_TABLES) {
    const ownResult = await selectUserIds({
      supabaseUrl,
      publishableKey,
      accessToken: session.accessToken,
      table: table.name,
    });

    assertOwnRows({
      label: session.label,
      table: table.name,
      rows: ownResult.rows,
      userId: session.userId,
      requireOwnRow: table.requireOwnRow,
    });

    const otherResult = await selectUserIds({
      supabaseUrl,
      publishableKey,
      accessToken: session.accessToken,
      table: table.name,
      userId: otherUserId,
    });

    if (otherResult.rows.length !== 0) {
      throw new Error(
        `${session.label} can explicitly query another user's ${table.name} rows.`,
      );
    }
  }
}

async function verifyAnonymousIsolation({ supabaseUrl, publishableKey }) {
  for (const table of PRIVATE_TABLES) {
    const result = await selectUserIds({
      supabaseUrl,
      publishableKey,
      table: table.name,
      allowDenied: true,
    });

    if (!result.denied && result.rows.length !== 0) {
      throw new Error(`Anonymous access can read ${table.name} rows.`);
    }
  }
}

async function main() {
  const fileEnv = parseEnvFile(new URL('../.env', import.meta.url));
  const supabaseUrl = requireValue(
    process.env.EXPO_PUBLIC_SUPABASE_URL ??
      fileEnv.EXPO_PUBLIC_SUPABASE_URL,
    'EXPO_PUBLIC_SUPABASE_URL',
  ).replace(/\/+$/, '');
  const publishableKey = requireValue(
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      fileEnv.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  );

  const sessions = [];
  for (const account of ACCOUNTS) {
    sessions.push(
      await signIn({ supabaseUrl, publishableKey, account }),
    );
  }

  if (sessions[0].userId === sessions[1].userId) {
    throw new Error('The two security test accounts resolved to the same user.');
  }

  console.log('PASS  Both security test accounts signed in.');

  await verifyAccountIsolation({
    supabaseUrl,
    publishableKey,
    session: sessions[0],
    otherUserId: sessions[1].userId,
  });
  console.log('PASS  Development account can read only its private rows.');

  await verifyAccountIsolation({
    supabaseUrl,
    publishableKey,
    session: sessions[1],
    otherUserId: sessions[0].userId,
  });
  console.log('PASS  App Review account can read only its private rows.');

  await verifyAnonymousIsolation({ supabaseUrl, publishableKey });
  console.log('PASS  Anonymous access cannot read private rows.');
  console.log(
    'PASS  Cloud RLS security check completed without changing server data.',
  );
}

main().catch((error) => {
  console.error(`FAIL  ${error.message}`);
  process.exitCode = 1;
});
