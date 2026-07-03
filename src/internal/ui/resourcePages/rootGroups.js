import { toFlatItems } from "../../project/tree.js";

const ROOT_GROUP_ID = "_root";

export const createRootItemsGroup = ({ data, label = "Root" } = {}) => {
  const children = toFlatItems(data).filter(
    (item) => item.parentId === null && item.type !== "folder",
  );

  if (children.length === 0) {
    return undefined;
  }

  return {
    id: "_root",
    name: label,
    fullLabel: label,
    type: "folder",
    _level: 0,
    parentId: null,
    hasChildren: true,
    children,
  };
};

export const createFolderChildFolderIdSet = (flatItems = []) => {
  const parentFolderIds = new Set();

  for (const item of Array.isArray(flatItems) ? flatItems : []) {
    if (item?.type === "folder") {
      parentFolderIds.add(item.parentId ?? ROOT_GROUP_ID);
    }
  }

  return parentFolderIds;
};

export const prependRootItemsGroup = ({ data, groups, label } = {}) => {
  const rootGroup = createRootItemsGroup({ data, label });
  if (!rootGroup) {
    return groups ?? [];
  }

  return [rootGroup, ...(groups ?? [])];
};
