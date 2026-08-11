import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_QUEUED_RESULTS_PER_USER,
  getQueuedGameResultsForUser,
  parseQueuedGameResults,
  removeQueuedGameResult,
  upsertQueuedGameResult,
} from '../src/services/gameResultQueue.mjs';

const NOW = Date.parse('2026-07-30T12:00:00.000Z');

function makePayload(clientResultId) {
  return { client_result_id: clientResultId };
}

function makeItem(userId, clientResultId, queuedAt = NOW) {
  return {
    payload: makePayload(clientResultId),
    queued_at: new Date(queuedAt).toISOString(),
    user_id: userId,
  };
}

test('parseQueuedGameResults drops malformed and expired entries', () => {
  const queue = [
    makeItem('user-a', 'result-current'),
    makeItem('user-a', 'result-expired', NOW - 91 * 24 * 60 * 60 * 1000),
    { user_id: 'user-a' },
  ];

  assert.deepEqual(parseQueuedGameResults(JSON.stringify(queue), NOW), [
    queue[0],
  ]);
  assert.deepEqual(parseQueuedGameResults('{bad json', NOW), []);
});

test('upsertQueuedGameResult keeps the newest copy of a result', () => {
  const original = makeItem('user-a', 'result-1', NOW - 1000);
  const updatedAt = new Date(NOW).toISOString();
  const queue = upsertQueuedGameResult(
    [original],
    makePayload('result-1'),
    'user-a',
    updatedAt,
  );

  assert.equal(queue.length, 1);
  assert.equal(queue[0].queued_at, updatedAt);
});

test('queue limits are applied per user without mixing account results', () => {
  let queue = [makeItem('user-b', 'result-b')];

  for (let index = 0; index <= MAX_QUEUED_RESULTS_PER_USER; index += 1) {
    queue = upsertQueuedGameResult(
      queue,
      makePayload(`result-a-${index}`),
      'user-a',
      new Date(NOW + index).toISOString(),
    );
  }

  const userAResults = getQueuedGameResultsForUser(queue, 'user-a');
  assert.equal(userAResults.length, MAX_QUEUED_RESULTS_PER_USER);
  assert.equal(userAResults[0].payload.client_result_id, 'result-a-1');
  assert.equal(getQueuedGameResultsForUser(queue, 'user-b').length, 1);
});

test('removeQueuedGameResult removes only the matching account result', () => {
  const queue = [
    makeItem('user-a', 'same-result'),
    makeItem('user-b', 'same-result'),
  ];

  assert.deepEqual(
    removeQueuedGameResult(queue, 'user-a', 'same-result'),
    [queue[1]],
  );
});
