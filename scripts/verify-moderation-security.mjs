import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

const PROJECT_REF = 'xuggavmtqgsxazbccfxj';
const TEST_CAPTCHA_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

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

function getServiceRoleKey() {
  let keys;
  try {
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
    keys = JSON.parse(raw);
  } catch {
    throw new Error('The Supabase service key could not be loaded through the linked CLI.');
  }

  return requireValue(
    keys.find((item) => item.name === 'service_role')?.api_key,
    'Supabase service role key',
  );
}

function authHeaders(apiKey, accessToken = apiKey) {
  return {
    apikey: apiKey,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

async function requestJson(url, options, label) {
  const response = await fetch(url, options);
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Some successful delete requests have an empty response body.
  }
  if (!response.ok) {
    throw new Error(`${label} failed with HTTP ${response.status}.`);
  }
  return payload;
}

async function createTestAccount(context, suffix, label) {
  const profileLabel = label === 'moderator' ? 'Test Alpha' : 'Test Beta';
  const account = {
    email: `islem-moderation-${suffix}-${label}@example.invalid`,
    label,
    password: randomBytes(24).toString('base64url'),
    profileLabel,
    username: `mod_${suffix}_${label}`.slice(0, 24),
  };
  const payload = await requestJson(
    `${context.supabaseUrl}/auth/v1/admin/users`,
    {
      method: 'POST',
      headers: authHeaders(context.serviceRoleKey),
      body: JSON.stringify({
        email: account.email,
        email_confirm: true,
        password: account.password,
      }),
    },
    `Create ${label} account`,
  );
  if (!payload?.id) {
    throw new Error(`Create ${label} account returned no user id.`);
  }
  account.userId = payload.id;
  return account;
}

async function deleteTestAccount(context, account) {
  if (!account?.userId) {
    return;
  }
  await requestJson(
    `${context.supabaseUrl}/auth/v1/admin/users/${account.userId}`,
    {
      method: 'DELETE',
      headers: authHeaders(context.serviceRoleKey),
    },
    `Delete ${account.label} account`,
  );
}

async function signIn(context, account) {
  const payload = await requestJson(
    `${context.supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        apikey: context.publishableKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: account.email,
        password: account.password,
        gotrue_meta_security: { captcha_token: TEST_CAPTCHA_TOKEN },
      }),
    },
    `${account.label} sign-in`,
  );
  if (!payload?.access_token || payload.user?.id !== account.userId) {
    throw new Error(`${account.label} sign-in returned an incomplete session.`);
  }
  return { ...account, accessToken: payload.access_token };
}

async function rpc(context, session, functionName, parameters = {}) {
  return requestJson(
    `${context.supabaseUrl}/rest/v1/rpc/${functionName}`,
    {
      method: 'POST',
      headers: authHeaders(context.publishableKey, session.accessToken),
      body: JSON.stringify(parameters),
    },
    `${session.label} ${functionName}`,
  );
}

async function serviceRpc(context, functionName, parameters = {}) {
  return requestJson(
    `${context.supabaseUrl}/rest/v1/rpc/${functionName}`,
    {
      method: 'POST',
      headers: authHeaders(context.serviceRoleKey),
      body: JSON.stringify(parameters),
    },
    `Service ${functionName}`,
  );
}

async function assertRpcDenied(context, session, functionName, parameters = {}) {
  const response = await fetch(
    `${context.supabaseUrl}/rest/v1/rpc/${functionName}`,
    {
      method: 'POST',
      headers: authHeaders(context.publishableKey, session.accessToken),
      body: JSON.stringify(parameters),
    },
  );
  if (![400, 401, 403].includes(response.status)) {
    throw new Error(`${session.label} ${functionName} was not denied.`);
  }
}

async function assertAnonymousDenied(context, functionName, parameters = {}) {
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

async function assertDirectReportReadDenied(context, session) {
  const response = await fetch(
    `${context.supabaseUrl}/rest/v1/player_reports?select=*`,
    { headers: authHeaders(context.publishableKey, session.accessToken) },
  );
  if (![401, 403].includes(response.status)) {
    throw new Error('Direct player report reads were not denied.');
  }
}

async function main() {
  const fileEnv = parseEnvFile(new URL('../.env', import.meta.url));
  const context = {
    supabaseUrl: requireValue(
      process.env.EXPO_PUBLIC_SUPABASE_URL ?? fileEnv.EXPO_PUBLIC_SUPABASE_URL,
      'EXPO_PUBLIC_SUPABASE_URL',
    ).replace(/\/+$/, ''),
    publishableKey: requireValue(
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
        fileEnv.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    ),
    serviceRoleKey: getServiceRoleKey(),
  };

  const suffix = randomBytes(4).toString('hex');
  let moderator;
  let player;

  try {
    moderator = await createTestAccount(context, suffix, 'moderator');
    player = await createTestAccount(context, suffix, 'player');
    moderator = await signIn(context, moderator);
    player = await signIn(context, player);

    for (const account of [moderator, player]) {
      await rpc(context, account, 'update_own_profile', {
        p_display_name: account.profileLabel,
        p_locale: 'en',
        p_username: account.username,
      });
    }

    await assertRpcDenied(context, moderator, 'list_player_reports', {
      p_limit: 10,
      p_status: 'pending',
    });
    await assertRpcDenied(context, player, 'moderate_player_report', {
      p_action: 'review',
      p_report_id: null,
      p_resolution: null,
    });
    await assertDirectReportReadDenied(context, player);
    await assertAnonymousDenied(context, 'list_player_reports', {
      p_limit: 10,
      p_status: 'pending',
    });
    console.log('PASS  Non-moderators and anonymous users cannot access moderation data.');

    const reportResult = await rpc(context, moderator, 'report_player', {
      p_reason: 'harassment',
      p_target_user_id: player.userId,
    });
    if (reportResult !== 'reported') {
      throw new Error(`Temporary report returned ${String(reportResult)}.`);
    }

    const grantedRole = await serviceRpc(context, 'set_report_moderator', {
      p_enabled: true,
      p_role: 'moderator',
      p_user_id: moderator.userId,
    });
    if (grantedRole !== 'moderator') {
      throw new Error('Moderator role was not granted by the service role.');
    }
    if ((await rpc(context, moderator, 'get_report_moderator_access')) !== 'moderator') {
      throw new Error('Moderator access could not be read by its owner.');
    }

    const reports = await rpc(context, moderator, 'list_player_reports', {
      p_limit: 100,
      p_status: 'pending',
    });
    const report = reports.find(
      (item) => item.reported_player_id === player.userId,
    );
    const safeReportKeys = new Set([
      'created_at',
      'display_name_snapshot',
      'reason',
      'related_open_reports',
      'report_id',
      'reported_player_id',
      'resolution',
      'reviewed_at',
      'status',
      'username_snapshot',
    ]);
    if (
      !report ||
      report.reason !== 'harassment' ||
      Object.keys(report).some((key) => !safeReportKeys.has(key))
    ) {
      throw new Error('Moderator report list is incomplete or exposes reporter data.');
    }

    const reviewResult = await rpc(
      context,
      moderator,
      'moderate_player_report',
      {
        p_action: 'review',
        p_report_id: report.report_id,
        p_resolution: null,
      },
    );
    if (reviewResult?.[0]?.status !== 'reviewing') {
      throw new Error('Report did not enter the reviewing state.');
    }

    const dismissResult = await rpc(
      context,
      moderator,
      'moderate_player_report',
      {
        p_action: 'dismiss',
        p_report_id: report.report_id,
        p_resolution: 'no_violation',
      },
    );
    if (
      dismissResult?.[0]?.status !== 'dismissed' ||
      dismissResult[0].resolution !== 'no_violation'
    ) {
      throw new Error('Report was not dismissed with the expected resolution.');
    }

    const actions = await rpc(
      context,
      moderator,
      'list_player_report_actions',
      { p_report_id: report.report_id },
    );
    if (
      actions.length !== 2 ||
      actions[0].previous_status !== 'pending' ||
      actions[0].next_status !== 'reviewing' ||
      actions[1].previous_status !== 'reviewing' ||
      actions[1].next_status !== 'dismissed'
    ) {
      throw new Error('Moderation audit history is incomplete or out of order.');
    }
    console.log('PASS  Moderator decisions are state-checked and recorded in order.');

    await serviceRpc(context, 'set_report_moderator', {
      p_enabled: false,
      p_role: 'moderator',
      p_user_id: moderator.userId,
    });
    if ((await rpc(context, moderator, 'get_report_moderator_access')) !== null) {
      throw new Error('Revoked moderator access remained active.');
    }
    await assertRpcDenied(context, moderator, 'list_player_report_actions', {
      p_report_id: report.report_id,
    });
    console.log('PASS  Revoked moderators immediately lose access.');
  } finally {
    if (moderator?.userId) {
      try {
        await serviceRpc(context, 'set_report_moderator', {
          p_enabled: false,
          p_role: 'moderator',
          p_user_id: moderator.userId,
        });
      } catch {
        // Account deletion below also removes its moderator membership.
      }
    }
    await deleteTestAccount(context, player);
    await deleteTestAccount(context, moderator);
  }

  console.log('PASS  Moderation security check completed and cleaned up test accounts.');
}

main().catch((error) => {
  console.error(`FAIL  ${error.message}`);
  process.exitCode = 1;
});
