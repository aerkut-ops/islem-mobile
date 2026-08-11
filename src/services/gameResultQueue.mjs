export const MAX_QUEUED_RESULTS_PER_USER = 50;
export const MAX_TOTAL_QUEUED_RESULTS = 100;
export const QUEUE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export function parseQueuedGameResults(raw, nowTimestamp = Date.now()) {
  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const oldestAcceptedTimestamp = nowTimestamp - QUEUE_RETENTION_MS;
  return compactQueuedGameResults(
    parsed.filter((item) => {
      const queuedTimestamp = Date.parse(item?.queued_at);
      return (
        item &&
        typeof item.user_id === 'string' &&
        typeof item.payload?.client_result_id === 'string' &&
        Number.isFinite(queuedTimestamp) &&
        queuedTimestamp >= oldestAcceptedTimestamp
      );
    }),
  );
}

export function upsertQueuedGameResult(
  queuedResults,
  payload,
  userId,
  queuedAt = new Date().toISOString(),
) {
  const withoutDuplicate = queuedResults.filter(
    (item) =>
      item.user_id !== userId ||
      item.payload?.client_result_id !== payload.client_result_id,
  );

  return compactQueuedGameResults([
    ...withoutDuplicate,
    { payload, queued_at: queuedAt, user_id: userId },
  ]);
}

export function removeQueuedGameResult(
  queuedResults,
  userId,
  clientResultId,
) {
  return queuedResults.filter(
    (item) =>
      item.user_id !== userId ||
      item.payload?.client_result_id !== clientResultId,
  );
}

export function getQueuedGameResultsForUser(queuedResults, userId) {
  return queuedResults.filter((item) => item.user_id === userId);
}

function compactQueuedGameResults(queuedResults) {
  const perUserCounts = new Map();
  const resultIds = new Set();
  const kept = [];

  for (let index = queuedResults.length - 1; index >= 0; index -= 1) {
    const item = queuedResults[index];
    const resultKey = `${item.user_id}:${item.payload.client_result_id}`;
    const userCount = perUserCounts.get(item.user_id) || 0;

    if (
      kept.length >= MAX_TOTAL_QUEUED_RESULTS ||
      userCount >= MAX_QUEUED_RESULTS_PER_USER ||
      resultIds.has(resultKey)
    ) {
      continue;
    }

    kept.push(item);
    resultIds.add(resultKey);
    perUserCounts.set(item.user_id, userCount + 1);
  }

  return kept.reverse();
}
