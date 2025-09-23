import { customRandom } from "nanoid";
import { createTauriSQLiteRepositoryAdapter } from "./tauriRepositoryAdapter";

const set = (state, path, value) => {
  const newState = structuredClone(state);
  const keys = path.split(".");
  let current = newState;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    current[key] = { ...current[key] };
    current = current[key];
  }

  const targetKey = keys[keys.length - 1];

  // Check if value is an object with replace and item properties
  if (
    value &&
    typeof value === "object" &&
    "replace" in value &&
    "item" in value
  ) {
    const { replace, item } = value;

    // Only apply merge logic if item is an object and target exists
    if (
      !replace &&
      item &&
      typeof item === "object" &&
      current[targetKey] &&
      typeof current[targetKey] === "object"
    ) {
      // Merge new properties with existing object
      current[targetKey] = { ...current[targetKey], ...item };
    } else {
      // Replace the whole thing (default behavior or when replace: true)
      current[targetKey] = item;
    }
  } else {
    // Original behavior - replace the whole thing
    current[targetKey] = value;
  }

  return newState;
};

const unset = (state, path) => {
  const newState = structuredClone(state);
  const keys = path.split(".");
  let current = newState;

  // Navigate to the parent of the property to delete
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!current[key]) return newState; // Path doesn't exist, return unchanged
    current[key] = { ...current[key] };
    current = current[key];
  }

  const targetKey = keys[keys.length - 1];
  if (current && typeof current === "object" && targetKey in current) {
    delete current[targetKey];
  }

  return newState;
};

const get = (state, path) => {
  return path.split(".").reduce((acc, key) => {
    return acc[key];
  }, state);
};

// Helper function to find a node in the tree
const findNodeInTree = (tree, nodeId) => {
  if (!tree || !Array.isArray(tree)) return null;

  for (let node of tree) {
    if (node && node.id === nodeId) {
      return { node, parent: null, parentArray: tree };
    }
    if (node && node.children) {
      const result = findNodeInTree(node.children, nodeId);
      if (result) {
        return { ...result, parent: node };
      }
    }
  }
  return null;
};

// Helper function to remove a node from tree
const removeNodeFromTree = (tree, nodeId) => {
  if (!tree || !Array.isArray(tree)) return false;

  for (let i = 0; i < tree.length; i++) {
    if (tree[i] && tree[i].id === nodeId) {
      tree.splice(i, 1);
      return true;
    }
    if (
      tree[i] &&
      tree[i].children &&
      removeNodeFromTree(tree[i].children, nodeId)
    ) {
      return true;
    }
  }
  return false;
};

// Tree manipulation functions
const treePush = (state, target, value) => {
  const newState = structuredClone(state);
  const targetData = get(newState, target);
  const { parent, item, position } = value;

  // Ensure tree and items exist
  if (!targetData.tree) {
    targetData.tree = [];
  }
  if (!targetData.items) {
    targetData.items = {};
  }

  // Add item to items object
  targetData.items[item.id] = { ...item };
  delete targetData.items[item.id].id; // Remove id from item data

  // Create tree node
  const newNode = {
    id: item.id,
    children: [],
  };

  // Helper function to insert node at the specified position
  const insertAtPosition = (array, node, position) => {
    if (position === "first") {
      array.unshift(node);
    } else if (position === "last") {
      array.push(node);
    } else if (position && typeof position === "object") {
      if (position.after) {
        const index = array.findIndex((n) => n.id === position.after);
        if (index !== -1) {
          array.splice(index + 1, 0, node);
        } else {
          array.push(node); // Fallback to end if not found
        }
      } else if (position.before) {
        const index = array.findIndex((n) => n.id === position.before);
        if (index !== -1) {
          array.splice(index, 0, node);
        } else {
          array.unshift(node); // Fallback to beginning if not found
        }
      }
    } else {
      // Default to first if position is undefined
      array.unshift(node);
    }
  };

  if (parent === "_root") {
    // Add to root level
    insertAtPosition(targetData.tree, newNode, position);
  } else {
    // Add to specific parent
    const parentInfo = findNodeInTree(targetData.tree, parent);
    if (parentInfo && parentInfo.node) {
      if (!parentInfo.node.children) {
        parentInfo.node.children = [];
      }
      insertAtPosition(parentInfo.node.children, newNode, position);
    }
  }

  return newState;
};

const treeDelete = (state, target, value) => {
  const newState = structuredClone(state);
  const targetData = get(newState, target);
  const { id } = value;

  // Ensure tree and items exist
  if (!targetData.tree) {
    targetData.tree = [];
  }
  if (!targetData.items) {
    targetData.items = {};
  }

  // Remove from tree
  removeNodeFromTree(targetData.tree, id);

  // Remove from items
  delete targetData.items[id];

  return newState;
};

// Helper function to create seeded ID generator
const createSeededIdGenerator = (seed) => {
  let currentSeed = seed;

  const random = (size) => {
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      // Linear congruential generator with better distribution
      currentSeed = (currentSeed * 1103515245 + 12345) & 0x7fffffff;
      // Use different bits for each byte to avoid patterns
      bytes[i] = (currentSeed >>> ((i % 4) * 8)) & 0xff;
    }
    return bytes;
  };

  const alphabet =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-";
  return customRandom(alphabet, 21, random);
};

/**
 * Copy a node under its parent in the tree structure
 * @param {*} state - The current state object
 * @param {*} target - Path to the target data (e.g., 'fileExplorer')
 * @param {Object} value - Copy operation parameters
 * @param {string} value.id - ID of the node to copy
 * @returns {Object} New state with the node moved to its new position
 * @example
 * // Copy node 'file1' under its parent
 * const newState = treeCopy(state, 'fileExplorer', {
 *  id: 'file1'
 * });
 */
const treeCopy = (state, target, value) => {
  const newState = structuredClone(state);
  const targetData = get(newState, target);
  const { id, seed } = value;
  const nodeInfo = findNodeInTree(targetData.tree, id);

  if (!nodeInfo) {
    return newState; // Node not found, return unchanged state
  }

  if (!seed) {
    throw new Error("Seed is required for deterministic ID generation.");
  }

  const { node, parent } = nodeInfo;

  // Create deterministic ID generator based on seed
  const generateId = createSeededIdGenerator(seed);

  // Helper function to recursively duplicate nodes and their items
  const duplicateNode = (originalNode, isRoot = false) => {
    const newNode = structuredClone(originalNode);

    // Generate deterministic ID based on seed
    newNode.id = generateId();

    // Copy the item data - this must happen for EVERY node, not just root
    if (targetData.items[originalNode.id]) {
      targetData.items[newNode.id] = structuredClone(
        targetData.items[originalNode.id],
      );
      delete targetData.items[newNode.id].id; // Remove id from item data

      // Add " (copy)" suffix to the name for the root node only
      if (isRoot && targetData.items[newNode.id].name) {
        targetData.items[newNode.id].name += " (copy)";
      }
    }

    // Recursively duplicate children (isRoot = false for children)
    if (originalNode.children && originalNode.children.length > 0) {
      newNode.children = originalNode.children.map((child) =>
        duplicateNode(child, false),
      );
    } else {
      newNode.children = [];
    }

    return newNode;
  };

  // Duplicate the node and all its descendants
  const newNode = duplicateNode(node, true);

  if (parent) {
    // Add the new node to the parent's children
    parent.children.push(newNode);
  } else {
    // If no parent, add to root level
    targetData.tree.push(newNode);
  }

  return newState;
};

const treeUpdate = (state, target, value) => {
  const newState = structuredClone(state);
  const targetData = get(newState, target);
  const { id, replace, item } = value;

  if (replace) {
    // Full replace
    targetData.items[id] = { ...item };
    delete targetData.items[id].id;
  } else {
    // Partial update
    targetData.items[id] = { ...targetData.items[id], ...item };
    delete targetData.items[id].id;
  }

  return newState;
};

/**
 * Moves a node from one position to another in the tree structure
 *
 * @param {Object} state - The current state object
 * @param {string} target - Path to the target data (e.g., 'fileExplorer')
 * @param {Object} value - Move operation parameters
 * @param {string} value.id - ID of the node to move
 * @param {string} value.parent - ID of the new parent node ('_root' for root level)
 * @param {string|Object} [value.position] - Position specification:
 *   - 'first': Insert at the beginning
 *   - 'last': Insert at the end
 *   - { after: 'nodeId' }: Insert after the specified node
 *   - { before: 'nodeId' }: Insert before the specified node
 *   - undefined: Default to 'first'
 * @returns {Object} New state with the node moved to its new position
 *
 * @example
 * // Move node 'file1' to root level at the beginning
 * const newState = treeMove(state, 'fileExplorer', {
 *   id: 'file1',
 *   parent: '_root',
 *   position: 'first'
 * });
 *
 * @example
 * // Move node 'file2' to root level at the end
 * const newState = treeMove(state, 'fileExplorer', {
 *   id: 'file2',
 *   parent: '_root',
 *   position: 'last'
 * });
 *
 * @example
 * // Move node 'file3' after 'folder1'
 * const newState = treeMove(state, 'fileExplorer', {
 *   id: 'file3',
 *   parent: '_root',
 *   position: { after: 'folder1' }
 * });
 *
 * @example
 * // Move node 'file4' before 'file5' in 'folder2'
 * const newState = treeMove(state, 'fileExplorer', {
 *   id: 'file4',
 *   parent: 'folder2',
 *   position: { before: 'file5' }
 * });
 */
const treeMove = (state, target, value) => {
  const newState = structuredClone(state);
  const targetData = get(newState, target);
  const { id, parent, position } = value;

  // Find and remove node from current position
  const nodeInfo = findNodeInTree(targetData.tree, id);
  if (!nodeInfo) return state;

  const nodeToMove = structuredClone(nodeInfo.node);
  removeNodeFromTree(targetData.tree, id);

  // Helper function to insert node at the specified position
  const insertAtPosition = (array, node, position) => {
    if (position === "first") {
      array.unshift(node);
    } else if (position === "last") {
      array.push(node);
    } else if (position && typeof position === "object") {
      if (position.after) {
        const index = array.findIndex((n) => n.id === position.after);
        if (index !== -1) {
          array.splice(index + 1, 0, node);
        } else {
          array.push(node); // Fallback to end if not found
        }
      } else if (position.before) {
        const index = array.findIndex((n) => n.id === position.before);
        if (index !== -1) {
          array.splice(index, 0, node);
        } else {
          array.unshift(node); // Fallback to beginning if not found
        }
      }
    } else {
      // Default to first if position is undefined
      array.unshift(node);
    }
  };

  // Insert at new position
  if (parent === "_root") {
    insertAtPosition(targetData.tree, nodeToMove, position);
  } else {
    const parentInfo = findNodeInTree(targetData.tree, parent);
    if (parentInfo && parentInfo.node) {
      if (!parentInfo.node.children) {
        parentInfo.node.children = [];
      }
      insertAtPosition(parentInfo.node.children, nodeToMove, position);
    }
  }

  return newState;
};

// For web version - creates a simple factory with a single repository
export const createWebRepositoryFactory = (initialState, store) => {
  let repository = null;

  return {
    async getByProject(_projectId) {
      // Web version ignores projectId - always returns the same repository
      if (!repository) {
        repository = createRepositoryInternal(initialState, store);
        await repository.init();
      }
      return repository;
    },
  };
};

// For Tauri version - creates a factory with multi-project support
export const createRepositoryFactory = (initialState, keyValueStore) => {
  const repositoryFactory = {
    getByProject: async (projectId) => {
      const projects = (await keyValueStore.get("projects")) || [];
      const project = projects.find((project) => project.id === projectId);
      if (!project) {
        throw new Error("project not found");
      }

      const store = await createTauriSQLiteRepositoryAdapter(
        project.projectPath,
      );
      const repository = createRepositoryInternal(initialState, store);
      await repository.init();
      return repository;
    },
    getByPath: async (projectPath) => {
      console.log("Getting repository for path:", projectPath);
      const store = await createTauriSQLiteRepositoryAdapter(projectPath);
      const repository = createRepositoryInternal(initialState, store);
      await repository.init();
      return repository;
    },
  };

  return repositoryFactory;
};

const createRepositoryInternal = (initialState, store) => {
  let cachedActionStreams = [];

  const init = async () => {
    cachedActionStreams = (await store.getAllEvents()) || [];
  };

  const addAction = async (action) => {
    cachedActionStreams.push(action);
    await store.addAction(action);
  };

  const getState = (untilActionIndex) => {
    // If untilActionIndex is provided, only compute state up to that action
    const events =
      untilActionIndex !== undefined
        ? cachedActionStreams.slice(0, untilActionIndex)
        : cachedActionStreams;

    // Compute state from action stream
    return events.reduce((acc, action) => {
      const { actionType, target, value } = action;
      if (actionType === "set") {
        return set(acc, target, value);
      } else if (actionType === "unset") {
        return unset(acc, target);
      } else if (actionType === "treePush") {
        return treePush(acc, target, value);
      } else if (actionType === "treeDelete") {
        return treeDelete(acc, target, value);
      } else if (actionType === "treeUpdate") {
        return treeUpdate(acc, target, value);
      } else if (actionType === "treeMove") {
        return treeMove(acc, target, value);
      } else if (actionType === "treeCopy") {
        return treeCopy(acc, target, value);
      } else if (actionType === "init") {
        const newState = structuredClone(acc);
        for (const [key, data] of Object.entries(value)) {
          if (newState[key] !== undefined) {
            newState[key] = data;
          }
        }
        return newState;
      }
      return acc;
    }, structuredClone(initialState));
  };

  const getAllEvents = () => {
    return cachedActionStreams;
  };

  return {
    init,
    addAction,
    getState,
    getAllEvents,
  };
};

export const toFlatItems = (data) => {
  const { items, tree } = data;
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

  tree.forEach((node) => traverse(node));
  return flatItems;
};

/**
 *
 * children will always be list of items
 * example result:
 *
 * [{
 *   id: '..',
 *   fullLabel: '...',
 *   type: 'folder',
 *   children: [...]
 * }, {
 *   id: '..',
 *   fullLabel: '...',
 *   type: 'folder',
 *   children: [...]
 * }]
 */
export const toFlatGroups = (data) => {
  const { items, tree } = data;
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

  tree.forEach((node) => traverse(node));
  return flatGroups;
};

/**
 * Converts the tree structure to a hierarchical format where each node contains
 * its full item data and children are nested with their data
 *
 * @param {Object} data - Object containing items and tree
 * @param {Object} data.items - Map of item IDs to item data
 * @param {Array} data.tree - Tree structure with nodes containing id and children
 * @returns {Array} Hierarchical tree with full item data at each node
 *
 * @example
 * // Input: { items: { 'f1': { name: 'Folder' }, 'f2': { name: 'File' } }, tree: [{ id: 'f1', children: [{ id: 'f2', children: [] }] }] }
 * // Output: [{ id: 'f1', name: 'Folder', children: [{ id: 'f2', name: 'File', children: [] }] }]
 */
export const toTreeStructure = (data) => {
  const { items, tree } = data;

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

  return tree.map((node) => traverse(node));
};
