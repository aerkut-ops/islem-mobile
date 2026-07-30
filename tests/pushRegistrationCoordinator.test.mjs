import assert from 'node:assert/strict';
import test from 'node:test';

import { createPushRegistrationCoordinator } from '../src/services/pushRegistrationCoordinator.mjs';

test('suspendAndDrain cancels work that has not registered a token yet', async () => {
  const coordinator = createPushRegistrationCoordinator();
  let release;
  let registered = false;

  const registration = coordinator.run(async (isCancelled) => {
    await new Promise((resolve) => {
      release = resolve;
    });
    if (!isCancelled()) {
      registered = true;
    }
    return { status: isCancelled() ? 'disabled' : 'enabled' };
  });

  await Promise.resolve();
  const drain = coordinator.suspendAndDrain();
  release();

  assert.deepEqual(await registration, { status: 'disabled' });
  await drain;
  assert.equal(registered, false);
});

test('registrations stay disabled until the coordinator resumes', async () => {
  const coordinator = createPushRegistrationCoordinator();
  await coordinator.suspendAndDrain();

  let calls = 0;
  assert.deepEqual(
    await coordinator.run(async () => {
      calls += 1;
      return { status: 'enabled' };
    }),
    { status: 'disabled' },
  );
  assert.equal(calls, 0);

  coordinator.resume();
  assert.deepEqual(
    await coordinator.run(async () => {
      calls += 1;
      return { status: 'enabled' };
    }),
    { status: 'enabled' },
  );
  assert.equal(calls, 1);
});

test('nested suspensions must all resume before registration restarts', async () => {
  const coordinator = createPushRegistrationCoordinator();
  await coordinator.suspendAndDrain();
  await coordinator.suspendAndDrain();

  coordinator.resume();
  assert.deepEqual(await coordinator.run(async () => ({ status: 'enabled' })), {
    status: 'disabled',
  });

  coordinator.resume();
  assert.deepEqual(await coordinator.run(async () => ({ status: 'enabled' })), {
    status: 'enabled',
  });
});
