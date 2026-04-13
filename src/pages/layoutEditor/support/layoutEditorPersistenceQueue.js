const queueByOwner = new WeakMap();

export const enqueueLayoutEditorPersistence = async ({ owner, task } = {}) => {
  if (!owner || typeof task !== "function") {
    return task?.();
  }

  const previous = queueByOwner.get(owner) || Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  queueByOwner.set(owner, next);

  try {
    return await next;
  } finally {
    if (queueByOwner.get(owner) === next) {
      queueByOwner.delete(owner);
    }
  }
};

export const waitForLayoutEditorPersistenceIdle = async ({ owner } = {}) => {
  if (!owner) {
    return;
  }

  const pending = queueByOwner.get(owner);
  if (!pending) {
    return;
  }

  await pending.catch(() => {});
};
