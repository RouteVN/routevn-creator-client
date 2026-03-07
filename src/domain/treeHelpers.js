/**
 * @typedef {Object} HelperHierarchyNode
 * @property {string} id
 * @property {HelperHierarchyNode[]} [children]
 */

const ROOT_PARENT_KEY = "__root__";

/**
 * @typedef {Record<string, unknown>} HelperItemMetadata
 */

/**
 * @typedef {Object} HierarchyDataInput
 * @property {Record<string, HelperItemMetadata>} items
 * @property {HelperHierarchyNode[]} [tree]
 * @property {HelperHierarchyNode[]} [order]
 */

/**
 * @typedef {HelperItemMetadata & { id: string, _level: number, fullLabel: string, parentId: string|null, hasChildren: boolean }} FlatItem
 */

/**
 * @typedef {HelperItemMetadata & { id: string, _level: number, fullLabel: string, parentId: string|null, hasChildren: boolean, children: FlatItem[] }} FlatGroup
 */

/**
 * @typedef {HelperItemMetadata & { id: string, _level: number, fullLabel: string, parentId: string|null, hasChildren: boolean, children: HierarchyItemNode[] }} HierarchyItemNode
 */

const isHierarchyNode = (value) =>
  value && typeof value === "object" && typeof value.id === "string";

const toOrderIds = (order) => {
  const list = Array.isArray(order) ? order : [];
  const ids = [];
  const seen = new Set();
  for (const entry of list) {
    const id =
      typeof entry === "string"
        ? entry
        : isHierarchyNode(entry)
          ? entry.id
          : null;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
};

const buildHierarchyFromOrderedIds = ({ items, orderedIds }) => {
  const itemIds = Object.keys(items || {});
  const seen = new Set();
  const normalizedIds = [];

  for (const id of orderedIds || []) {
    if (typeof id !== "string" || id.length === 0) continue;
    if (!Object.prototype.hasOwnProperty.call(items, id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    normalizedIds.push(id);
  }

  for (const id of itemIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    normalizedIds.push(id);
  }

  const itemIdSet = new Set(normalizedIds);
  const childrenByParent = new Map([[ROOT_PARENT_KEY, []]]);
  for (const id of normalizedIds) {
    const parentId = items[id]?.parentId;
    const validParentId =
      typeof parentId === "string" &&
      parentId.length > 0 &&
      parentId !== id &&
      itemIdSet.has(parentId)
        ? parentId
        : ROOT_PARENT_KEY;
    if (!childrenByParent.has(validParentId)) {
      childrenByParent.set(validParentId, []);
    }
    childrenByParent.get(validParentId).push(id);
  }

  const visited = new Set();
  const buildNode = (id, stack = new Set()) => {
    if (visited.has(id)) return null;
    if (stack.has(id)) return { id };
    visited.add(id);
    stack.add(id);
    const childIds = childrenByParent.get(id) || [];
    const children = [];
    for (const childId of childIds) {
      const childNode = buildNode(childId, stack);
      if (childNode) children.push(childNode);
    }
    stack.delete(id);
    return children.length > 0 ? { id, children } : { id };
  };

  const rootIds = childrenByParent.get(ROOT_PARENT_KEY) || [];
  const hierarchy = rootIds.map((id) => buildNode(id)).filter(Boolean);
  for (const id of normalizedIds) {
    if (visited.has(id)) continue;
    hierarchy.push({ id });
  }
  return hierarchy;
};

const normalizeOrder = (data) => {
  const items = data?.items || {};
  const itemIds = Object.keys(items);
  const order = Array.isArray(data?.tree)
    ? data.tree
    : Array.isArray(data?.order)
      ? data.order
      : [];
  if (order.length === 0) {
    if (itemIds.length === 0) return [];
    return buildHierarchyFromOrderedIds({ items, orderedIds: itemIds });
  }

  const hasStringEntries = order.some((entry) => typeof entry === "string");
  if (!hasStringEntries) {
    return order.filter((entry) => isHierarchyNode(entry));
  }

  return buildHierarchyFromOrderedIds({
    items,
    orderedIds: toOrderIds(order),
  });
};

/**
 * Flattens a order structure into an array of items with metadata.
 * Includes level, parent information, and full labels for each item.
 *
 * @param {HierarchyDataInput} data - Hierarchy data object containing items and order
 * @returns {FlatItem[]} Flat array of items with metadata
 *
 * @example
 * const flatItems = toFlatItems(hierarchyData);
 * // Returns: [{ id: 'folder1', name: 'Folder', _level: 0, fullLabel: 'Folder', ... }]
 */
export const toFlatItems = (data) => {
  const items = data?.items || {};
  const order = normalizeOrder(data);
  const flatItems = [];
  const visited = new Set();

  const traverse = (node, level = 0, parentChain = []) => {
    if (!node || typeof node.id !== "string") return;
    const children = Array.isArray(node.children) ? node.children : [];
    if (visited.has(node.id)) return;
    visited.add(node.id);

    // Build full label from parent chain
    const parentLabels = parentChain
      .map((parentId) => items[parentId]?.name)
      .filter(Boolean);
    const fullLabel =
      parentLabels.length > 0
        ? `${parentLabels.join(" > ")} > ${items[node.id]?.name || ""}`
        : items[node.id]?.name || "";

    const item = {
      ...items[node.id],
      id: node.id,
      _level: level,
      fullLabel,
      hasChildren: children.length > 0,
      parentId: parentChain[parentChain.length - 1] || null,
    };
    flatItems.push(item);

    if (children.length > 0) {
      const newParentChain = [...parentChain, node.id];
      children.forEach((child) => traverse(child, level + 1, newParentChain));
    }
  };

  order.forEach((node) => traverse(node));
  return flatItems;
};

/**
 * Groups order items by their parent folders.
 * Creates flat groups where folders contain their non-folder children.
 *
 * @param {HierarchyDataInput} data - Hierarchy data object containing items and order
 * @returns {FlatGroup[]} Array of folder groups with their children
 *
 * @example
 * const groups = toFlatGroups(hierarchyData);
 * // Returns: [{ id: 'folder1', type: 'folder', children: [{ id: 'file1', ... }] }]
 */
export const toFlatGroups = (data) => {
  const items = data?.items || {};
  const order = normalizeOrder(data);
  const flatGroups = [];
  const visited = new Set();

  const traverse = (node, level = 0, parentChain = []) => {
    if (!node || typeof node.id !== "string") return;
    const childrenNodes = Array.isArray(node.children) ? node.children : [];
    if (visited.has(node.id)) return;
    visited.add(node.id);

    // Create groups for nodes that are folders (including empty folders)
    if (items[node.id]?.type === "folder") {
      // Build full label from parent chain
      const parentLabels = parentChain
        .map((parentId) => items[parentId]?.name)
        .filter(Boolean);
      const fullLabel =
        parentLabels.length > 0
          ? `${parentLabels.join(" > ")} > ${items[node.id]?.name || ""}`
          : items[node.id]?.name || "";

      // Create children items with full data (only non-folder items)
      const children = childrenNodes
        .filter((child) => items[child.id]?.type !== "folder")
        .map((child) => ({
          ...items[child.id],
          id: child.id,
          _level: level + 1,
          parentId: node.id,
          hasChildren:
            Array.isArray(child.children) && child.children.length > 0,
        }));

      // Create the group
      const group = {
        ...items[node.id],
        id: node.id,
        fullLabel,
        type: "folder",
        _level: level,
        parentId: parentChain[parentChain.length - 1] || null,
        hasChildren: childrenNodes.length > 0,
        children,
      };

      flatGroups.push(group);

      // Continue traversing children
      const newParentChain = [...parentChain, node.id];
      childrenNodes.forEach((child) =>
        traverse(child, level + 1, newParentChain),
      );
    }
  };

  order.forEach((node) => traverse(node));
  return flatGroups;
};

/**
 * Converts the order structure to a hierarchical format where each node contains
 * its full item data and children are nested with their data
 *
 * @param {HierarchyDataInput} data - Object containing items and order
 * @returns {HierarchyItemNode[]} Hierarchical order with full item data at each node
 *
 * @example
 * // Input: { items: { 'f1': { name: 'Folder' }, 'f2': { name: 'File' } }, order: [{ id: 'f1', children: [{ id: 'f2', children: [] }] }] }
 * // Output: [{ id: 'f1', name: 'Folder', children: [{ id: 'f2', name: 'File', children: [] }] }]
 */
export const toHierarchyStructure = (data) => {
  const items = data?.items || {};
  const order = normalizeOrder(data);

  const traverse = (node, level = 0, parentChain = []) => {
    if (!node || typeof node.id !== "string") {
      return null;
    }
    const childrenNodes = Array.isArray(node.children) ? node.children : [];
    // Build full label from parent chain
    const parentLabels = parentChain
      .map((parentId) => items[parentId]?.name)
      .filter(Boolean);
    const fullLabel =
      parentLabels.length > 0
        ? `${parentLabels.join(" > ")} > ${items[node.id]?.name || ""}`
        : items[node.id]?.name || "";

    // Create the node with full item data
    const result = {
      ...items[node.id],
      id: node.id,
      _level: level,
      fullLabel,
      parentId: parentChain[parentChain.length - 1] || null,
      hasChildren: childrenNodes.length > 0,
      children: childrenNodes
        .map((child) => traverse(child, level + 1, [...parentChain, node.id]))
        .filter(Boolean),
    };

    return result;
  };

  return order.map((node) => traverse(node)).filter(Boolean);
};
