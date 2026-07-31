import assert from 'node:assert/strict';
import test from 'node:test';
import { createSerialTaskQueue } from '../src/services/serialTaskQueue.mjs';

test('tasks for the same key run in submission order', async () => {
  const queue = createSerialTaskQueue();
  const events = [];
  let releaseFirst;
  let markFirstStarted;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const firstStarted = new Promise((resolve) => {
    markFirstStarted = resolve;
  });

  const first = queue.run('room-a', async () => {
    events.push('first-start');
    markFirstStarted();
    await firstGate;
    events.push('first-end');
    return 1;
  });
  const second = queue.run('room-a', async () => {
    events.push('second');
    return 2;
  });

  await firstStarted;
  assert.deepEqual(events, ['first-start']);
  releaseFirst();
  assert.deepEqual(await Promise.all([first, second]), [1, 2]);
  assert.deepEqual(events, ['first-start', 'first-end', 'second']);
});

test('a failed task does not block the next task', async () => {
  const queue = createSerialTaskQueue();
  const first = queue.run('room-a', async () => {
    throw new Error('network');
  });
  const second = queue.run('room-a', async () => 'recovered');

  await assert.rejects(first, /network/);
  assert.equal(await second, 'recovered');
});

test('different keys can run independently', async () => {
  const queue = createSerialTaskQueue();
  let releaseRoomA;
  const roomAGate = new Promise((resolve) => {
    releaseRoomA = resolve;
  });

  const roomA = queue.run('room-a', () => roomAGate);
  const roomB = queue.run('room-b', async () => 'room-b-done');

  assert.equal(await roomB, 'room-b-done');
  releaseRoomA('room-a-done');
  assert.equal(await roomA, 'room-a-done');
});
