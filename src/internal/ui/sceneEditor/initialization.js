// Async lifecycle resources belong to orchestration, not render state.
const sessions = new WeakMap();

export const cancelSceneInitialization = (store) => {
  sessions.get(store)?.controller.abort();
};

export const getSceneInitializationTarget = (store) =>
  sessions.get(store)?.sceneId;

export const getSceneInitializationSignal = (store) =>
  sessions.get(store)?.controller.signal;

// Redraws can join asset loads started by initialization/restoration. They must
// retain that session's signal even if fullscreen later replaces the session.
export const runSceneEditorRender = async (deps, operation) => {
  const signal = deps.signal ?? getSceneInitializationSignal(deps.store);
  if (signal?.aborted) return;
  try {
    return await operation({ ...deps, signal });
  } catch (error) {
    if (!signal?.aborted) throw error;
  }
};

export const startSceneInitialization = (store, sceneId) => {
  cancelSceneInitialization(store);
  const controller = new AbortController();
  sessions.set(store, { controller, sceneId });
  return controller.signal;
};
