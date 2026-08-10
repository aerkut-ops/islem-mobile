import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

const PROJECT_REF = 'xuggavmtqgsxazbccfxj';
const MODERATOR_EMAIL = 'islemappsupport+moderation@gmail.com';
const KEYCHAIN_SERVICE = 'islem-moderation-account';

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

function getServiceRoleKey() {
  const raw = execFileSync(
    'npx',
    [
      'supabase',
      'projects',
      'api-keys',
      '--project-ref',
      PROJECT_REF,
      '--reveal',
      '--output',
      'json',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const keys = JSON.parse(raw);
  const serviceRoleKey = keys.find(
    (item) => item.name === 'service_role',
  )?.api_key;
  if (!serviceRoleKey) {
    throw new Error('Supabase service role key is unavailable.');
  }
  return serviceRoleKey;
}

function getStoredPassword() {
  try {
    return execFileSync(
      'security',
      [
        'find-generic-password',
        '-s',
        KEYCHAIN_SERVICE,
        '-a',
        MODERATOR_EMAIL,
        '-w',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trimEnd();
  } catch {
    return null;
  }
}

function storePassword(password) {
  execFileSync(
    'security',
    [
      'add-generic-password',
      '-U',
      '-s',
      KEYCHAIN_SERVICE,
      '-a',
      MODERATOR_EMAIL,
      '-w',
      password,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
}

function headers(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };
}

async function requestJson(url, options, label) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${label} failed with HTTP ${response.status}.`);
  }
  return payload;
}

async function main() {
  const fileEnv = parseEnvFile(new URL('../.env', import.meta.url));
  const supabaseUrl = String(
    process.env.EXPO_PUBLIC_SUPABASE_URL ??
      fileEnv.EXPO_PUBLIC_SUPABASE_URL ??
      '',
  ).replace(/\/+$/, '');
  if (!supabaseUrl) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL is missing.');
  }

  const serviceRoleKey = getServiceRoleKey();
  const adminHeaders = headers(serviceRoleKey);
  const users = await requestJson(
    `${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1000`,
    { headers: adminHeaders },
    'List Supabase users',
  );
  let account = users?.users?.find(
    (user) => user.email?.toLowerCase() === MODERATOR_EMAIL,
  );
  let password = getStoredPassword();

  if (!account) {
    password ||= randomBytes(28).toString('base64url');
    account = await requestJson(
      `${supabaseUrl}/auth/v1/admin/users`,
      {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          email: MODERATOR_EMAIL,
          email_confirm: true,
          password,
        }),
      },
      'Create moderator account',
    );
  } else if (!password) {
    password = randomBytes(28).toString('base64url');
    account = await requestJson(
      `${supabaseUrl}/auth/v1/admin/users/${account.id}`,
      {
        method: 'PUT',
        headers: adminHeaders,
        body: JSON.stringify({ email_confirm: true, password }),
      },
      'Rotate moderator password',
    );
  }

  if (!account?.id || !password) {
    throw new Error('Moderator account provisioning returned incomplete data.');
  }
  storePassword(password);

  const role = await requestJson(
    `${supabaseUrl}/rest/v1/rpc/set_report_moderator`,
    {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        p_enabled: true,
        p_role: 'owner',
        p_user_id: account.id,
      }),
    },
    'Grant moderator role',
  );
  if (role !== 'owner') {
    throw new Error('Moderator role grant returned an unexpected response.');
  }

  console.log(`PASS  Moderator account is ready: ${MODERATOR_EMAIL}`);
  console.log(`PASS  Password is stored in macOS Keychain: ${KEYCHAIN_SERVICE}`);
}

main().catch((error) => {
  console.error(`FAIL  ${error.message}`);
  process.exitCode = 1;
});
