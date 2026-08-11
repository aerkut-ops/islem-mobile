export function createPushRegistrationCoordinator() {
  let generation = 0;
  let suspensionCount = 0;
  const pendingRegistrations = new Set();

  function run(task) {
    if (suspensionCount > 0) {
      return Promise.resolve({ status: 'disabled' });
    }

    const taskGeneration = generation;
    const registration = Promise.resolve().then(() =>
      task(() => suspensionCount > 0 || generation !== taskGeneration),
    );

    pendingRegistrations.add(registration);
    const removeRegistration = () => pendingRegistrations.delete(registration);
    registration.then(removeRegistration, removeRegistration);
    return registration;
  }

  async function suspendAndDrain() {
    suspensionCount += 1;
    generation += 1;

    while (pendingRegistrations.size > 0) {
      await Promise.allSettled([...pendingRegistrations]);
    }
  }

  function resume() {
    suspensionCount = Math.max(0, suspensionCount - 1);
    generation += 1;
  }

  return {
    run,
    resume,
    suspendAndDrain,
  };
}
