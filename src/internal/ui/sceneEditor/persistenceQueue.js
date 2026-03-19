const queueByOwner = new WeakMap();
const latestTaskStateByOwner = new WeakMap();
const DEFAULT_PERSISTENCE_LABEL = "scene-editor-write";

const nowMs = () => {
  if (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  ) {
    return performance.now();
  }

  return Date.now();
};

export const enqueueSceneEditorPersistence = async ({
  owner,
  task,
  label = DEFAULT_PERSISTENCE_LABEL,
  meta = {},
} = {}) => {
  if (!owner || typeof task !== "function") {
    return task?.();
  }

  const queuedAt = nowMs();
  const resolvedMeta =
    label === DEFAULT_PERSISTENCE_LABEL
      ? {
          ...meta,
          unlabeled: true,
          caller: getPersistenceCaller(),
        }
      : meta;
  const previous = queueByOwner.get(owner) || Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(async () => {
      const startedAt = nowMs();
      const waitMs = startedAt - queuedAt;
      console.info("[sceneEditor][perf] persistence-start", {
        label,
        waitMs: Number(waitMs.toFixed(1)),
        ...resolvedMeta,
      });

      try {
        const result = await task();
        const runMs = nowMs() - startedAt;
        console.info("[sceneEditor][perf] persistence-end", {
          label,
          waitMs: Number(waitMs.toFixed(1)),
          runMs: Number(runMs.toFixed(1)),
          ...resolvedMeta,
        });
        return result;
      } catch (error) {
        const runMs = nowMs() - startedAt;
        console.info("[sceneEditor][perf] persistence-error", {
          label,
          waitMs: Number(waitMs.toFixed(1)),
          runMs: Number(runMs.toFixed(1)),
          error: error?.message || String(error),
          ...resolvedMeta,
        });
        throw error;
      }
    });
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
  label = DEFAULT_PERSISTENCE_LABEL,
  task,
  meta,
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
      const nextMeta =
        typeof taskState.meta === "function"
          ? taskState.meta()
          : taskState.meta;

      try {
        await enqueueSceneEditorPersistence({
          owner,
          task: nextTask,
          label,
          meta: nextMeta,
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
    taskState.meta = undefined;

    if (!taskState.pending && taskState.waiters.length === 0) {
      ownerState.delete(key);
    }

    if (ownerState.size === 0) {
      latestTaskStateByOwner.delete(owner);
    }
  });

  return completion;
};

const getPersistenceCaller = () => {
  const stack = new Error().stack;
  if (!stack) {
    return undefined;
  }

  const stackLines = stack
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean);
  const callerLine = stackLines.find((line) => {
    return (
      !line.includes("enqueueSceneEditorPersistence") &&
      !line.includes("enqueueLatestSceneEditorPersistence") &&
      !line.includes("persistenceQueue.js")
    );
  });

  return callerLine;
};
