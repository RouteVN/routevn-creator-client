/**
 * @typedef {Object} HelperHierarchyNode
 * @property {string} id
 * @property {HelperHierarchyNode[]} [children]
 */

/**
 * @typedef {Record<string, unknown>} HelperItemMetadata
 */

/**
 * @typedef {Object} HierarchyDataInput
 * @property {Record<string, HelperItemMetadata>} items
 * @property {HelperHierarchyNode[]} order
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
  const { items, order } = data;
  const flatItems = [];
  const visited = new Set();

  const traverse = (node, level = 0, parentChain = []) => {
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
      hasChildren: node.children && node.children.length > 0,
      parentId: parentChain[parentChain.length - 1] || null,
    };
    flatItems.push(item);

    if (node.children) {
      const newParentChain = [...parentChain, node.id];
      node.children.forEach((child) =>
        traverse(child, level + 1, newParentChain),
      );
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
  const { items, order } = data;
  const flatGroups = [];
  const visited = new Set();

  const traverse = (node, level = 0, parentChain = []) => {
    if (visited.has(node.id)) return;
    visited.add(node.id);

    // Create groups for nodes that are folders (including empty folders)
    if (node.children !== undefined && items[node.id]?.type === "folder") {
      // Build full label from parent chain
      const parentLabels = parentChain
        .map((parentId) => items[parentId]?.name)
        .filter(Boolean);
      const fullLabel =
        parentLabels.length > 0
          ? `${parentLabels.join(" > ")} > ${items[node.id]?.name || ""}`
          : items[node.id]?.name || "";

      // Create children items with full data (only non-folder items)
      const children = node.children
        .filter((child) => items[child.id]?.type !== "folder")
        .map((child) => ({
          ...items[child.id],
          id: child.id,
          _level: level + 1,
          parentId: node.id,
          hasChildren: child.children && child.children.length > 0,
        }));

      // Create the group
      const group = {
        ...items[node.id],
        id: node.id,
        fullLabel,
        type: "folder",
        _level: level,
        parentId: parentChain[parentChain.length - 1] || null,
        hasChildren: node.children && node.children.length > 0,
        children,
      };

      flatGroups.push(group);

      // Continue traversing children
      const newParentChain = [...parentChain, node.id];
      node.children.forEach((child) =>
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
  const { items, order } = data;

  const traverse = (node, level = 0, parentChain = []) => {
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
      hasChildren: node.children && node.children.length > 0,
      children: node.children
        ? node.children.map((child) =>
            traverse(child, level + 1, [...parentChain, node.id]),
          )
        : [],
    };

    return result;
  };

  return order.map((node) => traverse(node));
};
