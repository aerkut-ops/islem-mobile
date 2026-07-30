import { createClient } from 'npm:@supabase/supabase-js@2';
import { shouldDisablePushDevice } from './receiptPolicy.mjs';

const EXPO_PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_PUSH_RECEIPTS_URL =
  'https://exp.host/--/api/v2/push/getReceipts';
const MAX_NOTIFICATIONS_PER_RUN = 20;
const MAX_RECEIPTS_PER_RUN = 500;
const RECEIPT_WAIT_MS = 15 * 60 * 1000;
const RECEIPT_EXPIRY_MS = 24 * 60 * 60 * 1000;

type ClaimedNotification = {
  notification_id: string;
  recipient_user_id: string;
  notification_type:
    | 'friend_request'
    | 'friend_accepted'
    | 'challenge_invite'
    | 'challenge_accepted';
  actor_id: string;
  actor_username: string;
  actor_display_name: string | null;
  entity_id: string;
  attempt_count: number;
};

type PushDevice = {
  id: string;
  user_id: string;
  expo_push_token: string;
  locale: 'tr' | 'en';
};

type Delivery = {
  id: string;
  expo_ticket_id: string;
  push_device_id: string;
  created_at: string;
};

type MessageRecord = {
  device: PushDevice;
  notification: ClaimedNotification;
  message: Record<string, unknown>;
};

function requireEnvironment(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`${name} is unavailable.`);
  }
  return value;
}

function expoHeaders() {
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  return {
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
    ...(accessToken
      ? { Authorization: `Bearer ${accessToken}` }
      : {}),
  };
}

function safeErrorMessage(value: unknown) {
  const message =
    value instanceof Error ? value.message : String(value || 'unknown_error');
  return message.slice(0, 500);
}

function notificationCopy(
  notification: ClaimedNotification,
  locale: 'tr' | 'en',
) {
  const actor =
    notification.actor_display_name || `@${notification.actor_username}`;
  if (notification.notification_type === 'friend_request') {
    return locale === 'tr'
      ? `${actor} sana arkadaşlık isteği gönderdi.`
      : `${actor} sent you a friend request.`;
  }
  if (notification.notification_type === 'friend_accepted') {
    return locale === 'tr'
      ? `${actor} arkadaşlık isteğini kabul etti.`
      : `${actor} accepted your friend request.`;
  }
  if (notification.notification_type === 'challenge_invite') {
    return locale === 'tr'
      ? `${actor} sana meydan okuma daveti gönderdi.`
      : `${actor} sent you a challenge invitation.`;
  }
  return locale === 'tr'
    ? `${actor} meydan okuma davetini kabul etti.`
    : `${actor} accepted your challenge invitation.`;
}

function normalizeTickets(payload: unknown) {
  const data = (payload as { data?: unknown })?.data;
  if (Array.isArray(data)) {
    return data;
  }
  return data ? [data] : [];
}

async function verifyWorkerRequest(
  admin: ReturnType<typeof createClient>,
  request: Request,
) {
  const secret = request.headers.get('x-push-secret');
  if (!secret) {
    return false;
  }

  const { data, error } = await admin.rpc('verify_push_worker_secret', {
    p_secret: secret,
  });
  return !error && data === true;
}

async function disablePushDevice(
  admin: ReturnType<typeof createClient>,
  pushDeviceId: string,
) {
  const { error } = await admin
    .from('push_devices')
    .update({
      enabled: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', pushDeviceId);
  if (error) {
    throw error;
  }
}

async function processPushReceipts(
  admin: ReturnType<typeof createClient>,
) {
  const cutoff = new Date(Date.now() - RECEIPT_WAIT_MS).toISOString();
  const { data, error } = await admin
    .from('push_deliveries')
    .select('id, expo_ticket_id, push_device_id, created_at')
    .eq('status', 'ticketed')
    .is('receipt_checked_at', null)
    .not('expo_ticket_id', 'is', null)
    .lte('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(MAX_RECEIPTS_PER_RUN);

  if (error) {
    throw error;
  }

  const deliveries = (data || []) as Delivery[];
  if (deliveries.length === 0) {
    return { checked: 0, failed: 0 };
  }

  const response = await fetch(EXPO_PUSH_RECEIPTS_URL, {
    method: 'POST',
    headers: expoHeaders(),
    body: JSON.stringify({
      ids: deliveries.map((delivery) => delivery.expo_ticket_id),
    }),
  });
  if (!response.ok) {
    throw new Error(`Expo receipt request failed with HTTP ${response.status}.`);
  }

  const payload = await response.json();
  const receipts = payload?.data || {};
  let checked = 0;
  let failed = 0;
  const now = new Date().toISOString();

  for (const delivery of deliveries) {
    const receipt = receipts[delivery.expo_ticket_id];
    if (!receipt) {
      if (
        Date.now() - new Date(delivery.created_at).getTime() <
        RECEIPT_EXPIRY_MS
      ) {
        continue;
      }

      await admin
        .from('push_deliveries')
        .update({
          status: 'failed',
          error_code: 'ReceiptMissing',
          error_message: 'Expo did not return a receipt within 24 hours.',
          receipt_checked_at: now,
        })
        .eq('id', delivery.id);
      checked += 1;
      failed += 1;
      continue;
    }

    const errorCode = receipt?.details?.error || null;
    const delivered = receipt.status === 'ok';
    await admin
      .from('push_deliveries')
      .update({
        status: delivered ? 'delivered' : 'failed',
        error_code: errorCode,
        error_message: delivered
          ? null
          : safeErrorMessage(receipt.message || errorCode),
        receipt_checked_at: now,
      })
      .eq('id', delivery.id);

    if (shouldDisablePushDevice(errorCode, receipt?.message)) {
      await disablePushDevice(admin, delivery.push_device_id);
    }
    checked += 1;
    if (!delivered) {
      failed += 1;
    }
  }

  return { checked, failed };
}

async function markNotification(
  admin: ReturnType<typeof createClient>,
  notificationId: string,
  values: Record<string, unknown>,
) {
  const { error } = await admin
    .from('user_notifications')
    .update(values)
    .eq('id', notificationId);
  if (error) {
    throw error;
  }
}

async function dispatchPendingNotifications(
  admin: ReturnType<typeof createClient>,
) {
  const { data, error } = await admin.rpc(
    'claim_pending_push_notifications',
    { p_limit: MAX_NOTIFICATIONS_PER_RUN },
  );
  if (error) {
    throw error;
  }

  const notifications = (data || []) as ClaimedNotification[];
  if (notifications.length === 0) {
    return { claimed: 0, sent: 0, noDevices: 0, failed: 0 };
  }

  const recipientIds = [
    ...new Set(
      notifications.map((notification) => notification.recipient_user_id),
    ),
  ];
  const { data: deviceRows, error: deviceError } = await admin
    .from('push_devices')
    .select('id, user_id, expo_push_token, locale')
    .in('user_id', recipientIds)
    .eq('enabled', true);
  if (deviceError) {
    throw deviceError;
  }

  const devices = (deviceRows || []) as PushDevice[];
  const devicesByUser = new Map<string, PushDevice[]>();
  for (const device of devices) {
    const rows = devicesByUser.get(device.user_id) || [];
    rows.push(device);
    devicesByUser.set(device.user_id, rows);
  }

  const messageRecords: MessageRecord[] = [];
  let noDevices = 0;
  for (const notification of notifications) {
    const recipientDevices =
      devicesByUser.get(notification.recipient_user_id) || [];
    if (recipientDevices.length === 0) {
      await markNotification(admin, notification.notification_id, {
        push_status: 'no_devices',
        push_claimed_at: null,
        push_last_error: null,
      });
      noDevices += 1;
      continue;
    }

    for (const device of recipientDevices) {
      messageRecords.push({
        device,
        notification,
        message: {
          to: device.expo_push_token,
          title: 'İşlem',
          body: notificationCopy(notification, device.locale),
          sound: 'default',
          priority: 'high',
          data: {
            entityId: notification.entity_id,
            notificationId: notification.notification_id,
            screen:
              notification.notification_type === 'challenge_accepted'
                ? 'challenge'
                : 'friends',
            type: notification.notification_type,
          },
        },
      });
    }
  }

  if (messageRecords.length === 0) {
    return {
      claimed: notifications.length,
      sent: 0,
      noDevices,
      failed: 0,
    };
  }

  let tickets: unknown[];
  try {
    const response = await fetch(EXPO_PUSH_SEND_URL, {
      method: 'POST',
      headers: expoHeaders(),
      body: JSON.stringify(
        messageRecords.map((record) => record.message),
      ),
    });
    if (!response.ok) {
      throw new Error(`Expo push request failed with HTTP ${response.status}.`);
    }
    tickets = normalizeTickets(await response.json());
    if (tickets.length !== messageRecords.length) {
      throw new Error('Expo returned an unexpected push ticket count.');
    }
  } catch (sendError) {
    const errorMessage = safeErrorMessage(sendError);
    for (const notification of notifications) {
      if (!devicesByUser.get(notification.recipient_user_id)?.length) {
        continue;
      }
      await markNotification(admin, notification.notification_id, {
        push_status:
          notification.attempt_count < 3 ? 'pending' : 'failed',
        push_claimed_at: null,
        push_last_error: errorMessage,
      });
    }
    return {
      claimed: notifications.length,
      sent: 0,
      noDevices,
      failed: notifications.length - noDevices,
    };
  }

  const resultsByNotification = new Map<
    string,
    { ok: number; permanentFailure: number; temporaryFailure: number }
  >();

  for (let index = 0; index < messageRecords.length; index += 1) {
    const record = messageRecords[index];
    const ticket = tickets[index] as {
      status?: string;
      id?: string;
      message?: string;
      details?: { error?: string };
    };
    const errorCode = ticket?.details?.error || null;
    const ticketOk = ticket?.status === 'ok' && Boolean(ticket?.id);
    const result =
      resultsByNotification.get(record.notification.notification_id) || {
        ok: 0,
        permanentFailure: 0,
        temporaryFailure: 0,
      };

    if (ticketOk) {
      result.ok += 1;
    } else if (errorCode === 'DeviceNotRegistered') {
      result.permanentFailure += 1;
      await disablePushDevice(admin, record.device.id);
    } else {
      result.temporaryFailure += 1;
    }
    resultsByNotification.set(
      record.notification.notification_id,
      result,
    );

    const { error: deliveryError } = await admin
      .from('push_deliveries')
      .upsert(
        {
          notification_id: record.notification.notification_id,
          push_device_id: record.device.id,
          expo_ticket_id: ticketOk ? ticket.id : null,
          status: ticketOk ? 'ticketed' : 'failed',
          error_code: errorCode,
          error_message: ticketOk
            ? null
            : safeErrorMessage(ticket?.message || errorCode),
          created_at: new Date().toISOString(),
          receipt_checked_at: ticketOk ? null : new Date().toISOString(),
        },
        { onConflict: 'notification_id,push_device_id' },
      );
    if (deliveryError) {
      throw deliveryError;
    }
  }

  let sent = 0;
  let failed = 0;
  for (const notification of notifications) {
    const result = resultsByNotification.get(notification.notification_id);
    if (!result) {
      continue;
    }

    if (result.ok > 0) {
      await markNotification(admin, notification.notification_id, {
        push_status: 'sent',
        push_sent_at: new Date().toISOString(),
        push_claimed_at: null,
        push_last_error: null,
      });
      sent += 1;
      continue;
    }

    const retry =
      result.temporaryFailure > 0 && notification.attempt_count < 3;
    await markNotification(admin, notification.notification_id, {
      push_status: retry ? 'pending' : 'failed',
      push_claimed_at: null,
      push_last_error: retry
        ? 'Expo temporarily rejected every device message.'
        : 'No active device accepted the push notification.',
    });
    failed += 1;
  }

  return {
    claimed: notifications.length,
    sent,
    noDevices,
    failed,
  };
}

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') {
      return Response.json({ error: 'Method not allowed.' }, { status: 405 });
    }

    const admin = createClient(
      requireEnvironment('SUPABASE_URL'),
      requireEnvironment('SUPABASE_SERVICE_ROLE_KEY'),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    if (!(await verifyWorkerRequest(admin, request))) {
      return Response.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    try {
      const receipts = await processPushReceipts(admin);
      const dispatch = await dispatchPendingNotifications(admin);
      return Response.json({ dispatch, receipts });
    } catch (error) {
      console.error('Push worker failed.', {
        message: safeErrorMessage(error),
      });
      return Response.json(
        { error: 'Push worker failed.' },
        { status: 500 },
      );
    }
  },
};
