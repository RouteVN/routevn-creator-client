const EMPTY_TREE = { tree: [], items: {} };

export const getMediaPageData = ({ repositoryState, resourceType } = {}) => {
  return repositoryState?.[resourceType] ?? EMPTY_TREE;
};

export const syncMediaPageData = ({
  store,
  repositoryState,
  resourceType,
} = {}) => {
  store.setItems({
    data: getMediaPageData({
      repositoryState,
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
