const EMPTY_TREE = { tree: [], items: {} };

export const getMediaPageData = ({ projectService, resourceType } = {}) => {
  return projectService.getState()[resourceType] ?? EMPTY_TREE;
};

export const syncMediaPageData = ({
  store,
  projectService,
  resourceType,
} = {}) => {
  store.setItems({
    data: getMediaPageData({ projectService, resourceType }),
  });
};

export const resolveResourceParentId = (groupId) => {
  if (!groupId || groupId === "_root") {
    return undefined;
  }

  return groupId;
};
