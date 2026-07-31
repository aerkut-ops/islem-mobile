import {
  groupChallengeInvites,
  normalizeChallengeResponse,
  normalizeChallengeRooms,
} from './challengeValidation.mjs';
import { createSerialTaskQueue } from './serialTaskQueue.mjs';
import { isSupabaseConfigured, supabase } from './supabaseClient';

const challengeOperationQueue = createSerialTaskQueue();
const acknowledgedChallengeOperations = new Map();

export async function loadChallengeInvites() {
  requireChallengeService();

  const { data, error } = await supabase.rpc('list_challenge_invites');
  if (error) {
    throw error;
  }

  return groupChallengeInvites(data);
}

export async function loadActiveChallengeRooms() {
  requireChallengeService();

  const { data, error } = await supabase.rpc(
    'list_active_challenge_rooms',
  );
  if (error) {
    throw error;
  }

  return normalizeChallengeRooms(data);
}

export async function loadActiveChallengeRoom() {
  const rooms = await loadActiveChallengeRooms();
  return rooms[0] || null;
}

export async function sendChallengeInvite(playerId) {
  return runChallengeAction('send_challenge_invite', {
    p_target_user_id: playerId,
  });
}

export async function respondChallengeInvite(inviteId, accept) {
  const response = await runChallengeAction('respond_challenge_invite', {
    p_accept: Boolean(accept),
    p_invite_id: inviteId,
  });
  return normalizeChallengeResponse(response);
}

export async function cancelChallengeInvite(inviteId) {
  return runChallengeAction('cancel_challenge_invite', {
    p_invite_id: inviteId,
  });
}

export async function cancelChallengeRoom(roomId) {
  return runChallengeAction('cancel_challenge_room', {
    p_room_id: roomId,
  });
}

export async function readyChallengeRoom(roomId, puzzle) {
  await runChallengeAction('ready_challenge_room', {
    p_room_id: roomId,
    p_source_numbers: puzzle.source,
    p_target_values: puzzle.targets.map((target) => target.value),
  });
  return loadChallengeRoom(roomId);
}

export function syncChallengeOperations(roomId, operations) {
  return challengeOperationQueue.run(roomId, async () => {
    return syncChallengeOperationsNow(roomId, operations);
  });
}

export function submitChallengeResult(roomId, operations = []) {
  return challengeOperationQueue.run(roomId, async () => {
    await syncChallengeOperationsNow(roomId, operations);
    await runChallengeAction('submit_challenge_result', {
      p_room_id: roomId,
    });
    return loadChallengeRoom(roomId);
  });
}

async function syncChallengeOperationsNow(roomId, operations) {
  const acknowledged =
    acknowledgedChallengeOperations.get(roomId) || new Set();
  acknowledgedChallengeOperations.set(roomId, acknowledged);
  let latestProgress = null;

  for (const [index, operation] of operations.entries()) {
    const operationId = operation.id || `legacy-${index + 1}`;
    if (acknowledged.has(operationId)) {
      continue;
    }

    const response = await runChallengeAction(
      'apply_challenge_operation',
      {
        p_a: operation.a,
        p_b: operation.b,
        p_op: operation.op,
        p_operation_id: operationId,
        p_result: operation.result,
        p_room_id: roomId,
      },
    );
    latestProgress = Array.isArray(response)
      ? response[0] || null
      : response;
    acknowledged.add(operationId);
  }

  return latestProgress;
}

async function loadChallengeRoom(roomId) {
  const rooms = await loadActiveChallengeRooms();
  return rooms.find((room) => room.room_id === roomId) || null;
}

async function runChallengeAction(functionName, parameters) {
  requireChallengeService();

  const { data, error } = await supabase.rpc(functionName, parameters);
  if (error) {
    throw error;
  }
  return data;
}

function requireChallengeService() {
  if (!isSupabaseConfigured || !supabase) {
    const error = new Error('challenges_unavailable');
    error.code = 'challenges_unavailable';
    throw error;
  }
}
