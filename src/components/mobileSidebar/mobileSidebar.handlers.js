import {
  getRecentSceneIds,
  recordRecentSceneVisit,
} from "../../internal/ui/recentScenes.js";

const resolveProjectId = (appService) => {
  return (
    appService?.getCurrentProjectId?.() || appService?.getPayload?.()?.p || ""
  );
};

const refreshRecentSceneIds = ({ appService, store } = {}) => {
  store.setRecentSceneIds?.({
    sceneIds: getRecentSceneIds({
      appService,
      projectId: resolveProjectId(appService),
    }),
  });
};

export const handleBeforeMount = (deps) => {
  const { appService, projectService, store, render } = deps;
  refreshRecentSceneIds({ appService, store });
  const cleanup = projectService.subscribeProjectState(
    ({ repositoryState } = {}) => {
      store.setScenesData({ scenesData: repositoryState?.scenes });
      refreshRecentSceneIds({ appService, store });
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

  const nextPayload = {};
  Object.assign(nextPayload, appService.getPayload());
  if (item.payload) {
    Object.assign(nextPayload, item.payload);
  }
  for (const key of item.clearPayloadKeys ?? []) {
    delete nextPayload[key];
  }

  if (item.payload?.s) {
    store.setRecentSceneIds?.({
      sceneIds: recordRecentSceneVisit({
        appService,
        projectId: nextPayload.p ?? resolveProjectId(appService),
        sceneId: item.payload.s,
      }),
    });
  }

  subject.dispatch("redirect", {
    path: item.path,
    payload: nextPayload,
  });
};
