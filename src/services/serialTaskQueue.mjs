export function createSerialTaskQueue() {
  const tails = new Map();

  return {
    run(key, task) {
      const previous = tails.get(key) || Promise.resolve();
      const result = previous.catch(() => undefined).then(task);
      const tail = result
        .then(
          () => undefined,
          () => undefined,
        )
        .finally(() => {
          if (tails.get(key) === tail) {
            tails.delete(key);
          }
        });

      tails.set(key, tail);
      return result;
    },
  };
}
