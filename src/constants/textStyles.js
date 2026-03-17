const getNodeId = (node) => {
  if (!node) {
    return undefined;
  }

  if (typeof node === "string") {
    return node;
  }

  return node.id;
};

const collectSubhierarchyIds = (node, accumulator) => {
  const nodeId = getNodeId(node);
  if (!nodeId) {
    return;
  }

  accumulator.push(nodeId);

  if (typeof node === "string" || !Array.isArray(node.children)) {
    return;
  }

  for (const child of node.children) {
    collectSubhierarchyIds(child, accumulator);
  }
};

const findSubhierarchyIds = (nodes, targetId) => {
  for (const node of nodes || []) {
    const nodeId = getNodeId(node);
    if (!nodeId) {
      continue;
    }

    if (nodeId === targetId) {
      const ids = [];
      collectSubhierarchyIds(node, ids);
      return ids;
    }

    if (typeof node !== "string" && Array.isArray(node.children)) {
      const childResult = findSubhierarchyIds(node.children, targetId);
      if (childResult.length > 0) {
        return childResult;
      }
    }
  }

  return [];
};

export const getFirstTextStyleId = (textStylesData = {}) => {
  const items = textStylesData.items || {};
  const orderedSubhierarchyIds = [];

  for (const node of textStylesData.tree || []) {
    collectSubhierarchyIds(node, orderedSubhierarchyIds);
  }

  const firstIdFromHierarchy = orderedSubhierarchyIds.find(
    (id) => items[id]?.type === "textStyle",
  );
  if (firstIdFromHierarchy) {
    return firstIdFromHierarchy;
  }

  const firstFallback = Object.entries(items).find(
    ([, item]) => item?.type === "textStyle",
  );
  return firstFallback?.[0];
};

export const getTextStyleCount = (textStylesData = {}) => {
  const items = textStylesData.items || {};
  return Object.values(items).filter((item) => item?.type === "textStyle")
    .length;
};

export const getTextStyleRemovalCount = (textStylesData = {}, itemId) => {
  if (!itemId) {
    return 0;
  }

  const items = textStylesData.items || {};
  const targetItem = items[itemId];
  if (!targetItem) {
    return 0;
  }

  if (targetItem.type === "textStyle") {
    return 1;
  }

  if (targetItem.type !== "folder") {
    return 0;
  }

  const subhierarchyIds = findSubhierarchyIds(
    textStylesData.tree || [],
    itemId,
  );
  if (subhierarchyIds.length === 0) {
    return 0;
  }

  return subhierarchyIds.filter((id) => items[id]?.type === "textStyle").length;
};
