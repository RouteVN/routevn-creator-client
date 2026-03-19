const queueByOwner = new WeakMap();
const latestTaskStateByOwner = new WeakMap();

export const enqueueSceneEditorPersistence = async ({ owner, task } = {}) => {
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

const getLatestTaskState = (owner, key) => {
  let ownerState = latestTaskStateByOwner.get(owner);
  if (!ownerState) {
    ownerState = new Map();
    latestTaskStateByOwner.set(owner, ownerState);
  }

  let taskState = ownerState.get(key);
  if (!taskState) {
    taskState = {
      running: false,
      pending: false,
      task: undefined,
      meta: undefined,
      promise: Promise.resolve(),
      waiters: [],
    };
    ownerState.set(key, taskState);
  }

  return {
    ownerState,
    taskState,
  };
};

export const enqueueLatestSceneEditorPersistence = async ({
  owner,
  key = "latest",
  task,
} = {}) => {
  if (!owner || typeof task !== "function") {
    return task?.();
  }

  const { ownerState, taskState } = getLatestTaskState(owner, key);
  taskState.pending = true;
  taskState.task = task;
  taskState.meta = meta;

  const completion = new Promise((resolve, reject) => {
    taskState.waiters.push({ resolve, reject });
  });

  if (taskState.running) {
    return completion;
  }

  taskState.running = true;
  taskState.promise = (async () => {
    let lastError;

    while (taskState.pending) {
      taskState.pending = false;
      const nextTask = taskState.task;

      try {
        await enqueueSceneEditorPersistence({
          owner,
          task: nextTask,
        });
      } catch (error) {
        lastError = error;
      }
    }

    const waiters = taskState.waiters.splice(0);
    if (lastError) {
      waiters.forEach(({ reject }) => reject(lastError));
      throw lastError;
    }

    waiters.forEach(({ resolve }) => resolve());
  })().finally(() => {
    taskState.running = false;
    taskState.task = undefined;

    if (!taskState.pending && taskState.waiters.length === 0) {
      ownerState.delete(key);
    }

    if (ownerState.size === 0) {
      latestTaskStateByOwner.delete(owner);
    }
  });

  return completion;
};
