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

export const getFirstTypographyId = (typography = {}) => {
  const items = typography.items || {};
  const orderedSubhierarchyIds = [];

  for (const node of typography.tree || []) {
    collectSubhierarchyIds(node, orderedSubhierarchyIds);
  }

  const firstIdFromHierarchy = orderedSubhierarchyIds.find(
    (id) => items[id]?.type === "typography",
  );
  if (firstIdFromHierarchy) {
    return firstIdFromHierarchy;
  }

  const firstFallback = Object.entries(items).find(
    ([, item]) => item?.type === "typography",
  );
  return firstFallback?.[0];
};

export const getTypographyCount = (typography = {}) => {
  const items = typography.items || {};
  return Object.values(items).filter((item) => item?.type === "typography")
    .length;
};

export const getTypographyRemovalCount = (typography = {}, itemId) => {
  if (!itemId) {
    return 0;
  }

  const items = typography.items || {};
  const targetItem = items[itemId];
  if (!targetItem) {
    return 0;
  }

  if (targetItem.type === "typography") {
    return 1;
  }

  if (targetItem.type !== "folder") {
    return 0;
  }

  const subhierarchyIds = findSubhierarchyIds(typography.tree || [], itemId);
  if (subhierarchyIds.length === 0) {
    return 0;
  }

  return subhierarchyIds.filter((id) => items[id]?.type === "typography")
    .length;
};
