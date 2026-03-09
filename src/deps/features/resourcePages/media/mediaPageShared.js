const EMPTY_TREE = { tree: [], items: {} };

export const getMediaPageData = ({
  repositoryState,
  projectService,
  resourceType,
} = {}) => {
  const state = repositoryState ?? projectService?.getState?.();
  return state?.[resourceType] ?? EMPTY_TREE;
};

export const syncMediaPageData = ({
  store,
  repositoryState,
  projectService,
  resourceType,
} = {}) => {
  store.setItems({
    data: getMediaPageData({
      repositoryState,
      projectService,
      resourceType,
    }),
  });
};

export const resolveResourceParentId = (groupId) => {
  if (!groupId || groupId === "_root") {
    return undefined;
  }

  return groupId;
};
