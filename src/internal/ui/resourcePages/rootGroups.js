import { toFlatItems } from "../../project/tree.js";

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

export const prependRootItemsGroup = ({ data, groups, label } = {}) => {
  const rootGroup = createRootItemsGroup({ data, label });
  if (!rootGroup) {
    return groups ?? [];
  }

  return [rootGroup, ...(groups ?? [])];
};
