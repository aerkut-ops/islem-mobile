import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ACCOUNTS = [
  {
    displayName: 'Test Oyuncusu',
    email: 'islemappsupport+test@gmail.com',
    keychainService: 'islem-supabase-test-account',
    label: 'Development',
    username: 'islem_test_player',
  },
  {
    displayName: 'App Review',
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
          captcha_token: 'XXXX.DUMMY.TOKEN.XXXX',
        },
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`${account.label} sign-in failed with HTTP ${response.status}.`);
  }
  const data = await response.json();
  return {
    ...account,
    accessToken: data.access_token,
    userId: data.user.id,
  };
}

function authHeaders(publishableKey, session) {
  return {
    apikey: publishableKey,
    Authorization: `Bearer ${session.accessToken}`,
    'Content-Type': 'application/json',
  };
}

async function updateProfile(supabaseUrl, publishableKey, session, profile) {
  return fetch(`${supabaseUrl}/rest/v1/rpc/update_own_profile`, {
    method: 'POST',
    headers: authHeaders(publishableKey, session),
    body: JSON.stringify({
      p_display_name: profile.displayName,
      p_locale: 'tr',
      p_username: profile.username,
    }),
  });
}

async function main() {
  const env = parseEnvFile(new URL('../.env', import.meta.url));
  const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL.replace(/\/+$/, '');
  const publishableKey = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const sessions = [];

  for (const account of ACCOUNTS) {
    sessions.push(await signIn(supabaseUrl, publishableKey, account));
  }

  for (const session of sessions) {
    const response = await updateProfile(
      supabaseUrl,
      publishableKey,
      session,
      session,
    );
    if (!response.ok) {
      throw new Error(
        `${session.label} profile update failed with HTTP ${response.status}.`,
      );
    }
  }
  console.log('PASS  Both test profiles were updated through the secured RPC.');

  const ownResponse = await fetch(
    `${supabaseUrl}/rest/v1/profiles?select=user_id,username,display_name`,
    { headers: authHeaders(publishableKey, sessions[0]) },
  );
  const ownRows = await ownResponse.json();
  if (
    !ownResponse.ok ||
    ownRows.length !== 1 ||
    ownRows[0].user_id !== sessions[0].userId
  ) {
    throw new Error('Development account profile select is not isolated.');
  }

  const otherResponse = await fetch(
    `${supabaseUrl}/rest/v1/profiles?select=user_id&user_id=eq.${sessions[1].userId}`,
    { headers: authHeaders(publishableKey, sessions[0]) },
  );
  const otherRows = await otherResponse.json();
  if (!otherResponse.ok || otherRows.length !== 0) {
    throw new Error('Development account can read another profile.');
  }
  console.log('PASS  Profile reads remain private to the signed-in account.');

  const directUpdateResponse = await fetch(
    `${supabaseUrl}/rest/v1/profiles?user_id=eq.${sessions[0].userId}`,
    {
      method: 'PATCH',
      headers: authHeaders(publishableKey, sessions[0]),
      body: JSON.stringify({ display_name: 'Direct update' }),
    },
  );
  if (![401, 403].includes(directUpdateResponse.status)) {
    throw new Error('Authenticated users can bypass the profile RPC.');
  }
  console.log('PASS  Direct profile table updates are denied.');

  const duplicateResponse = await updateProfile(
    supabaseUrl,
    publishableKey,
    sessions[1],
    {
      displayName: sessions[1].displayName,
      username: sessions[0].username,
    },
  );
  if (duplicateResponse.ok) {
    throw new Error('Duplicate username was accepted.');
  }

  const duplicateBody = await duplicateResponse.json();
  if (
    duplicateBody.code !== '23505' &&
    !String(duplicateBody.message || '').includes('username_taken')
  ) {
    throw new Error('Duplicate username returned an unexpected error.');
  }
  console.log('PASS  Usernames are unique across accounts.');

  const anonymousResponse = await fetch(
    `${supabaseUrl}/rest/v1/rpc/update_own_profile`,
    {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_display_name: 'Anonymous',
        p_locale: 'tr',
        p_username: 'anonymous_player',
      }),
    },
  );
  if (![401, 403].includes(anonymousResponse.status)) {
    throw new Error('Anonymous profile update was not denied.');
  }
  console.log('PASS  Anonymous profile updates are denied.');
}

main().catch((error) => {
  console.error(`FAIL  ${error.message}`);
  process.exitCode = 1;
});
