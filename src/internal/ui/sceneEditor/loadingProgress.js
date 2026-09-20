const DETAILS_DELAY_MS = 5_000;
const pendingDetails = new WeakMap();
const disposedStores = new WeakSet();

export const stopSceneLoadingDetails = (store) => {
  if (!pendingDetails.has(store)) return;
  clearTimeout(pendingDetails.get(store));
  pendingDetails.delete(store);
  store.setSceneLoadingDetailsVisible({ visible: false });
};

export const disposeSceneLoadingDetails = (store) => {
  stopSceneLoadingDetails(store);
  disposedStores.add(store);
};

const syncLoadingDetails = ({ store, render }) => {
  if (disposedStores.has(store)) return;
  const isLoading = () =>
    store.selectIsScenePageLoading() || store.selectIsSceneAssetLoading();
  if (!isLoading()) {
    stopSceneLoadingDetails(store);
    return;
  }
  // A stage change, or an overlapping asset load, keeps the original deadline.
  if (pendingDetails.has(store)) return;
  pendingDetails.set(
    store,
    setTimeout(() => {
      if (!isLoading()) return;
      store.setSceneLoadingDetailsVisible({ visible: true });
      render();
    }, DETAILS_DELAY_MS),
  );
};

export const setSceneEditorPageLoading = (deps, isLoading) => {
  deps.store.setScenePageLoading({ isLoading });
  syncLoadingDetails(deps);
};

export const setSceneEditorAssetLoading = (deps, isLoading) => {
  const { store, render } = deps;
  store.setSceneAssetLoading({ isLoading });
  syncLoadingDetails(deps);
  render();
};
