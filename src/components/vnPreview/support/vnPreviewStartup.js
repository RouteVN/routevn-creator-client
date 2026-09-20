import { runAsyncOperation } from "../../../internal/asyncOperation.js";

// Controllers belong to this component's async orchestration, never render state.
const sessions = new WeakMap();
const loadingDetailsTimers = new WeakMap();

const clearLoadingDetails = (store) => {
  if (!loadingDetailsTimers.has(store)) return;
  clearTimeout(loadingDetailsTimers.get(store));
  loadingDetailsTimers.delete(store);
  store.setLoadingDetailsVisible({ visible: false });
};

export const syncPreviewLoadingDetails = ({ store, render }) => {
  if (getPreviewSignal(store)?.aborted) return;
  if (!store.selectIsPreviewLoading()) {
    clearLoadingDetails(store);
    return;
  }
  // Keep the first deadline across stage changes and overlapping asset loads.
  if (loadingDetailsTimers.has(store)) return;
  loadingDetailsTimers.set(
    store,
    setTimeout(() => {
      if (getPreviewSignal(store)?.aborted || !store.selectIsPreviewLoading())
        return;
      store.setLoadingDetailsVisible({ visible: true });
      render();
    }, 5_000),
  );
};

export const getPreviewSignal = (store) => sessions.get(store)?.signal;

export const cancelPreviewStartup = (store) => {
  sessions.get(store)?.abort();
  clearLoadingDetails(store);
};

export const startPreviewStartup = ({ store, render }) => {
  cancelPreviewStartup(store);
  const controller = new AbortController();
  sessions.set(store, controller);
  const { signal } = controller;
  syncPreviewLoadingDetails({ store, render });
  const progress = (value) => {
    signal.throwIfAborted();
    store.setLoadingProgress(value);
    render();
  };
  return {
    signal,
    progress,
    step: async (stage, operation) => {
      progress({ stage });
      const value = await runAsyncOperation(operation, {
        signal,
        label: stage,
      });
      signal.throwIfAborted();
      return value;
    },
  };
};
