import {
  groupChallengeInvites,
  normalizeChallengeResponse,
  normalizeChallengeRooms,
} from './challengeValidation.mjs';
import { isSupabaseConfigured, supabase } from './supabaseClient';

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

export async function readyChallengeRoom(roomId) {
  await runChallengeAction('ready_challenge_room', {
    p_room_id: roomId,
  });
  return loadChallengeRoom(roomId);
}

export async function updateChallengeProgress(
  roomId,
  solvedTargets,
  moves,
) {
  return runChallengeAction('update_challenge_progress', {
    p_moves: moves,
    p_room_id: roomId,
    p_solved_targets: solvedTargets,
  });
}

export async function submitChallengeResult(roomId, moves) {
  await runChallengeAction('submit_challenge_result', {
    p_moves: moves,
    p_room_id: roomId,
  });
  return loadChallengeRoom(roomId);
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
