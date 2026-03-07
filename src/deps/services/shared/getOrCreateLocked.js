export const getOrCreateLocked = ({ cache, locks, key, create }) => {
  if (cache.has(key)) {
    return cache.get(key);
  }

  if (locks.has(key)) {
    return locks.get(key);
  }

  const pending = Promise.resolve()
    .then(create)
    .finally(() => {
      locks.delete(key);
    });

  locks.set(key, pending);
  return pending;
};
