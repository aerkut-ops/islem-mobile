import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentSession, isSupabaseConfigured, supabase } from './supabaseClient';

const GAME_RESULT_QUEUE_KEY = 'islem-cloud-game-result-queue-v1';
const MAX_QUEUED_RESULTS = 50;
const QUEUE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
let activeFlush = null;

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

  await flushQueuedGameResults();

  const { error } = await supabase.rpc('submit_game_result', {
    p_result: payload,
  });

  if (error) {
    await enqueueGameResult(payload, session.user.id);
    return { status: 'queued', error };
  }

  return { status: 'synced' };
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
    return { status: 'disabled', flushed: 0 };
  }

  const session = await getCurrentSession();
  if (!session) {
    return { status: 'guest', flushed: 0 };
  }

  const queuedResults = await loadQueuedGameResults();
  if (queuedResults.length === 0) {
    return { status: 'empty', flushed: 0 };
  }

  const remaining = [];
  let flushed = 0;

  for (const queuedItem of queuedResults) {
    if (queuedItem.user_id !== session.user.id) {
      remaining.push(queuedItem);
      continue;
    }

    const payload = queuedItem.payload;
    const { error } = await supabase.rpc('submit_game_result', {
      p_result: payload,
    });

    if (error) {
      remaining.push(queuedItem);
      continue;
    }

    flushed += 1;
  }

  await saveQueuedGameResults(remaining);
  return { status: remaining.length > 0 ? 'partial' : 'synced', flushed };
}

async function enqueueGameResult(payload, userId) {
  const queuedResults = await loadQueuedGameResults();
  const withoutDuplicate = queuedResults.filter(
    (item) => item.payload?.client_result_id !== payload.client_result_id,
  );
  const nextQueue = [
    ...withoutDuplicate,
    { payload, queued_at: new Date().toISOString(), user_id: userId },
  ].slice(-MAX_QUEUED_RESULTS);
  await saveQueuedGameResults(nextQueue);
}

async function loadQueuedGameResults() {
  try {
    const raw = await AsyncStorage.getItem(GAME_RESULT_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const oldestAcceptedTimestamp = Date.now() - QUEUE_RETENTION_MS;
    return Array.isArray(parsed)
      ? parsed.filter(
          (item) =>
            item &&
            typeof item.user_id === 'string' &&
            item.payload &&
            typeof item.payload.client_result_id === 'string' &&
            Number.isFinite(Date.parse(item.queued_at)) &&
            Date.parse(item.queued_at) >= oldestAcceptedTimestamp,
        )
      : [];
  } catch {
    return [];
  }
}

async function saveQueuedGameResults(queuedResults) {
  try {
    await AsyncStorage.setItem(GAME_RESULT_QUEUE_KEY, JSON.stringify(queuedResults));
  } catch {
    // Cloud sync must never block the local game.
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
