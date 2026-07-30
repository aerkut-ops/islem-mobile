import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentSession, isSupabaseConfigured, supabase } from './supabaseClient';
import {
  getQueuedGameResultsForUser,
  parseQueuedGameResults,
  removeQueuedGameResult,
  upsertQueuedGameResult,
} from './gameResultQueue.mjs';

const GAME_RESULT_QUEUE_KEY = 'islem-cloud-game-result-queue-v1';
const MAX_FLUSH_PASSES = 4;
let activeFlush = null;
let queueMutation = Promise.resolve();

export function buildGameResultPayload({ game, score, awardedScore, durationSeconds, hintUsedCount = 0, language = 'tr' }) {
  const finishedAt = new Date();
  const solvedTargets = game.targets.filter((target) => target.solved).length;
  const targetValues = game.initialPuzzle?.targets?.map((target) => target.value) || [];
  const sourceNumbers = game.initialPuzzle?.source || [];
  const puzzleKey = game.challengeKey || makePuzzleKey(game, sourceNumbers, targetValues);

  return {
    client_result_id: makeClientResultId(),
    mode: game.mode,
    difficulty: game.difficulty,
    score,
    awarded_score: awardedScore,
    targets_solved: solvedTargets,
    target_count: game.targets.length,
    operation_count: game.steps,
    duration_seconds: Math.max(0, Math.floor(durationSeconds || 0)),
    hint_used_count: Math.max(0, Math.floor(hintUsedCount || 0)),
    puzzle_key: puzzleKey,
    completed: Boolean(game.complete),
    par: game.par,
    board_size: game.boardSize,
    source_numbers: sourceNumbers,
    target_values: targetValues,
    locale: language,
    client_finished_at: finishedAt.toISOString(),
    client_utc_offset_minutes: -finishedAt.getTimezoneOffset(),
  };
}

export async function submitGameResult(payload) {
  if (!isSupabaseConfigured || !supabase) {
    return { status: 'disabled' };
  }

  const session = await getCurrentSession();
  if (!session) {
    return { status: 'guest' };
  }

  try {
    await enqueueGameResult(payload, session.user.id);
  } catch (storageError) {
    const { data, error } = await sendGameResult(payload);
    return error
      ? { status: 'failed', error, storageError }
      : { status: 'synced', data };
  }

  let flushResult = await flushQueuedGameResults();
  let pending = await isGameResultQueued(
    session.user.id,
    payload.client_result_id,
  );

  if (
    pending &&
    !flushResult.attemptedResultIds.includes(payload.client_result_id)
  ) {
    flushResult = await flushQueuedGameResults();
    pending = await isGameResultQueued(
      session.user.id,
      payload.client_result_id,
    );
  }

  return pending
    ? { status: 'queued', error: flushResult.lastError }
    : { status: 'synced' };
}

export async function flushQueuedGameResults() {
  if (activeFlush) {
    return activeFlush;
  }

  activeFlush = performQueuedGameResultFlush();
  try {
    return await activeFlush;
  } finally {
    activeFlush = null;
  }
}

async function performQueuedGameResultFlush() {
  if (!isSupabaseConfigured || !supabase) {
    return {
      status: 'disabled',
      flushed: 0,
      remaining: 0,
      attemptedResultIds: [],
      lastError: null,
    };
  }

  const session = await getCurrentSession();
  if (!session) {
    return {
      status: 'guest',
      flushed: 0,
      remaining: 0,
      attemptedResultIds: [],
      lastError: null,
    };
  }

  const attemptedResultIds = new Set();
  let flushed = 0;
  let lastError = null;

  for (let pass = 0; pass < MAX_FLUSH_PASSES; pass += 1) {
    const queuedResults = await loadQueuedGameResults();
    const pendingForUser = getQueuedGameResultsForUser(
      queuedResults,
      session.user.id,
    ).filter(
      (item) => !attemptedResultIds.has(item.payload.client_result_id),
    );

    if (pendingForUser.length === 0) {
      break;
    }

    for (const queuedItem of pendingForUser) {
      const payload = queuedItem.payload;
      attemptedResultIds.add(payload.client_result_id);
      const { error } = await sendGameResult(payload);

      if (error) {
        lastError = error;
        continue;
      }

      await deleteQueuedGameResult(
        session.user.id,
        payload.client_result_id,
      );
      flushed += 1;
    }
  }

  const remaining = getQueuedGameResultsForUser(
    await loadQueuedGameResults(),
    session.user.id,
  ).length;

  return {
    status:
      remaining > 0
        ? flushed > 0
          ? 'partial'
          : 'queued'
        : flushed > 0
          ? 'synced'
          : 'empty',
    flushed,
    remaining,
    attemptedResultIds: [...attemptedResultIds],
    lastError,
  };
}

async function enqueueGameResult(payload, userId) {
  return withQueueMutation(async () => {
    const queuedResults = await loadQueuedGameResultsUnlocked();
    await saveQueuedGameResults(
      upsertQueuedGameResult(queuedResults, payload, userId),
    );
  });
}

async function loadQueuedGameResults() {
  return withQueueMutation(loadQueuedGameResultsUnlocked);
}

async function loadQueuedGameResultsUnlocked() {
  const raw = await AsyncStorage.getItem(GAME_RESULT_QUEUE_KEY);
  return parseQueuedGameResults(raw);
}

async function deleteQueuedGameResult(userId, clientResultId) {
  return withQueueMutation(async () => {
    const queuedResults = await loadQueuedGameResultsUnlocked();
    await saveQueuedGameResults(
      removeQueuedGameResult(queuedResults, userId, clientResultId),
    );
  });
}

async function isGameResultQueued(userId, clientResultId) {
  const queuedResults = await loadQueuedGameResults();
  return getQueuedGameResultsForUser(queuedResults, userId).some(
    (item) => item.payload.client_result_id === clientResultId,
  );
}

export async function hasQueuedGameResults(userId) {
  if (!userId) {
    return false;
  }

  const queuedResults = await loadQueuedGameResults();
  return getQueuedGameResultsForUser(queuedResults, userId).length > 0;
}

async function saveQueuedGameResults(queuedResults) {
  await AsyncStorage.setItem(
    GAME_RESULT_QUEUE_KEY,
    JSON.stringify(queuedResults),
  );
}

function withQueueMutation(task) {
  const operation = queueMutation.then(task, task);
  queueMutation = operation.catch(() => {});
  return operation;
}

async function sendGameResult(payload) {
  try {
    return await supabase.rpc('submit_game_result', {
      p_result: payload,
    });
  } catch (error) {
    return { data: null, error };
  }
}

function makePuzzleKey(game, sourceNumbers, targetValues) {
  return [
    game.mode,
    game.difficulty,
    sourceNumbers.join('-'),
    targetValues.join('-'),
  ].join(':');
}

function makeClientResultId() {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `result-${Date.now().toString(36)}-${randomPart}`;
}
