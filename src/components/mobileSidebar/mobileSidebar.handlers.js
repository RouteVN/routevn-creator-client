export const handleBeforeMount = (deps) => {
  const { projectService, store, render } = deps;
  const cleanup = projectService.subscribeProjectState(
    ({ repositoryState } = {}) => {
      store.setScenesData({ scenesData: repositoryState?.scenes });
      render();
    },
  );

  return () => {
    cleanup?.();
  };
};

export const handleItemClick = (deps, payload = {}) => {
  const { appService, store, subject } = deps;
  const itemId = payload._event.currentTarget.dataset.itemId;
  const item = store.selectItemById({ itemId });

  if (!item) {
    return;
  }

  const currentPayload = appService.getPayload();
  const nextPayload = {
    ...currentPayload,
    ...(item.payload ?? {}),
  };
  for (const key of item.clearPayloadKeys ?? []) {
    delete nextPayload[key];
  }

  subject.dispatch("redirect", {
    path: item.path,
    payload: nextPayload,
  });
};
