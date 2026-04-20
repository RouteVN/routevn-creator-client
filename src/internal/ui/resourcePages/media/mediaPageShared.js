import { withResolvedCollectionFileMetadata } from "../../../resourceFileMetadata.js";

const EMPTY_TREE = { tree: [], items: {} };
export const DEFAULT_FILE_EXPLORER_AUTO_COLLAPSE_THRESHOLD = 100;

export const getMediaPageData = ({ repositoryState, resourceType } = {}) => {
  const collection = repositoryState?.[resourceType] ?? EMPTY_TREE;

  if (resourceType !== "images" && resourceType !== "sounds") {
    return collection;
  }

  return withResolvedCollectionFileMetadata({
    collection,
    files: repositoryState?.files,
    resourceTypes: [resourceType === "images" ? "image" : "sound"],
  });
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

export const shouldStartCollapsedFileExplorer = ({
  flatItems,
  threshold = DEFAULT_FILE_EXPLORER_AUTO_COLLAPSE_THRESHOLD,
} = {}) => {
  return (Array.isArray(flatItems) ? flatItems.length : 0) > threshold;
};
