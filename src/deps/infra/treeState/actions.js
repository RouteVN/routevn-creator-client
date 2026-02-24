/**
 * @typedef {Record<string, unknown>} JsonObject
 */

/**
 * @typedef {Object} TreeNode
 * @property {string} id
 * @property {TreeNode[]} [children]
 */

/**
 * @typedef {Object} TreeInsertRelativePosition
 * @property {string} [after]
 * @property {string} [before]
 */

/**
 * @typedef {"first"|"last"|TreeInsertRelativePosition} TreeInsertPosition
 */

/**
 * @typedef {JsonObject} TreeItemMetadata
 */

/**
 * @typedef {TreeItemMetadata & { id: string }} TreeItemInput
 */

/**
 * @typedef {Object} TreeData
 * @property {Record<string, TreeItemMetadata>} items
 * @property {TreeNode[]} tree
 */

/**
 * @typedef {Object} SetPayload
 * @property {string} target
 * @property {unknown} value
 * @property {{ replace?: boolean }} [options]
 */

/**
 * @typedef {Object} UnsetPayload
 * @property {string} target
 */

/**
 * @typedef {Object} TreePushPayload
 * @property {string} target
 * @property {TreeItemInput} value
 * @property {{ parent?: string, position?: TreeInsertPosition }} [options]
 */

/**
 * @typedef {Object} TreeDeletePayload
 * @property {string} target
 * @property {{ id: string }} options
 */

/**
 * @typedef {Object} TreeUpdatePayload
 * @property {string} target
 * @property {TreeItemMetadata} value
 * @property {{ id: string, replace?: boolean }} options
 */

/**
 * @typedef {Object} TreeMovePayload
 * @property {string} target
 * @property {{ id: string, parent?: string, position?: TreeInsertPosition }} options
 */

/**
 * @typedef {Object} InitPayload
 * @property {JsonObject} value
 */

/**
 * Gets a value at a specific path from the state object.
 * Returns undefined if the path doesn't exist.
 *
 * @param {JsonObject} state - The current state object
 * @param {string} path - Dot-separated path to the target location (e.g., 'user.profile.name')
 * @returns {unknown} The value at the specified path, or undefined if not found
 *
 * @example
 * get(state, 'user.profile.name'); // Returns 'Alice' or undefined
 */
const get = (state, path) => {
  return path.split(".").reduce((acc, key) => {
    return acc[key];
  }, state);
};

/**
 * Helper function to find a node in the tree structure.
 * Returns node information including parent context.
 *
 * @param {Array} tree - The tree array to search
 * @param {string} nodeId - The ID of the node to find
 * @returns {Object|null} Object containing { node, parent, parentArray } or null if not found
 *
 * @example
 * const result = findNodeInTree(tree, 'folder1');
 * // Returns: { node: { id: 'folder1', children: [] }, parent: null, parentArray: tree }
 */
/**
 * @param {TreeNode[]} tree
 * @param {string} nodeId
 * @returns {{ node: TreeNode, parent: TreeNode|null, parentArray: TreeNode[] } | null}
 */
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

/**
 * Helper function to remove a node from the tree structure.
 * Recursively searches for and removes the node with the specified ID.
 *
 * @param {Array} tree - The tree array to modify
 * @param {string} nodeId - The ID of the node to remove
 * @returns {boolean} True if node was found and removed, false otherwise
 *
 * @example
 * const removed = removeNodeFromTree(tree, 'folder1');
 * // Returns: true if 'folder1' was found and removed
 */
/**
 * @param {TreeNode[]} tree
 * @param {string} nodeId
 * @returns {boolean}
 */
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

/**
 * Helper function to collect all descendant IDs of a node.
 * Recursively traverses the tree to find all children and their descendants.
 *
 * @param {Array} tree - The tree array to search
 * @param {string} nodeId - The ID of the node whose descendants to collect
 * @returns {string[]} Array of all descendant IDs (excluding the node itself)
 *
 * @example
 * const descendants = collectDescendantIds(tree, 'folder1');
 * // Returns: ['file1', 'subfolder1', 'file2']
 */
/**
 * @param {TreeNode[]} tree
 * @param {string} nodeId
 * @returns {string[]}
 */
const collectDescendantIds = (tree, nodeId) => {
  const descendants = [];

  const findNodeAndCollect = (nodes, targetId) => {
    for (const node of nodes) {
      if (node && node.id === targetId) {
        // Found the target node, collect all its descendants
        collectAllChildren(node, descendants);
        return true;
      }
      if (
        node &&
        node.children &&
        findNodeAndCollect(node.children, targetId)
      ) {
        return true;
      }
    }
    return false;
  };

  const collectAllChildren = (node, collection) => {
    if (node && node.children) {
      for (const child of node.children) {
        if (child && child.id) {
          collection.push(child.id);
          collectAllChildren(child, collection);
        }
      }
    }
  };

  findNodeAndCollect(tree, nodeId);
  return descendants;
};

/**
 * Sets a value at a specific target in the state object.
 * Supports both direct replacement and merge operations.
 *
 * @param {Object} state - The current state object
 * @param {Object} payload - Action payload
 * @param {string} payload.target - Dot-separated path to the target location (e.g., 'user.profile.name')
 * @param {*} payload.value - The value to set
 * @param {Object} [payload.options] - Configuration options for the operation
 * @param {boolean} [payload.options.replace=false] - If true, replaces entire value. If false, merges with existing when both are objects
 * @returns {Object} New state object with the value applied
 *
 * @example
 * // Direct replacement (for primitives)
 * const newState = set(state, { target: 'user.profile.age', value: 30 });
 *
 * // Before: { user: { profile: { name: 'John', age: 25 } } }
 * // After:  { user: { profile: { name: 'John', age: 30 } } }
 *
 * @example
 * // Merge with existing object (default behavior)
 * const newState = set(state, { target: 'user.profile', value: { height: 180 } });
 *
 * // Before: { user: { profile: { name: 'John', age: 25 } } }
 * // After:  { user: { profile: { name: 'John', age: 25, height: 180 } } }
 *
 * @example
 * // Full replacement
 * const newState = set(state, {
 *   target: 'user.profile',
 *   value: { name: 'Bob', age: 30 },
 *   options: { replace: true }
 * });
 *
 * // Before: { user: { profile: { name: 'John', age: 25 } } }
 * // After:  { user: { profile: { name: 'Bob', age: 30 } } }
 */
/**
 * @param {JsonObject} state
 * @param {SetPayload} payload
 * @returns {JsonObject}
 */
export const set = (state, payload) => {
  const { target, value, options = {} } = payload;
  const newState = structuredClone(state);
  const keys = target.split(".");
  let current = newState;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    current[key] = { ...current[key] };
    current = current[key];
  }

  const targetKey = keys[keys.length - 1];
  const { replace = false } = options;

  // Only apply merge logic if replace is false and both values are plain objects (not arrays)
  if (!replace) {
    if (Array.isArray(value)) {
      throw new Error(
        "set with replace=false requires value to be a plain object, not an array",
      );
    }
    if (
      typeof current[targetKey] === "object" &&
      !Array.isArray(current[targetKey]) &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      value !== null
    ) {
      // Merge new properties with existing object
      current[targetKey] = { ...current[targetKey], ...value };
    } else {
      // Replace the whole thing for primitives or non-object types
      current[targetKey] = value;
    }
  } else {
    // Replace the whole thing (explicit replace: true)
    current[targetKey] = value;
  }

  return newState;
};

/**
 * Removes a property at a specific target from the state object.
 * Handles nested targets safely and returns unchanged state if target doesn't exist.
 *
 * @param {Object} state - The current state object
 * @param {Object} payload - Action payload
 * @param {string} payload.target - Dot-separated path to the property to remove (e.g., 'user.profile.email')
 * @returns {Object} New state object with the property removed
 *
 * @example
 * // Removing a nested property
 * const state = { user: { profile: { name: 'John', age: 25 } } };
 * const newState = unset(state, { target: 'user.profile.age' });
 *
 * // Before: { user: { profile: { name: 'John', age: 25 } } }
 * // After:  { user: { profile: { name: 'John' } } }
 *
 * @example
 * // Removing an entire object
 * const state = { user: { profile: { name: 'John', age: 25 } }, settings: { theme: 'dark' } };
 * const newState = unset(state, { target: 'user.profile' });
 *
 * // Before: { user: { profile: { name: 'John', age: 25 } }, settings: { theme: 'dark' } }
 * // After:  { user: { }, settings: { theme: 'dark' } }
 */
/**
 * @param {JsonObject} state
 * @param {UnsetPayload} payload
 * @returns {JsonObject}
 */
export const unset = (state, payload) => {
  const { target } = payload;
  const newState = structuredClone(state);
  const keys = target.split(".");
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

/**
 * Adds a new node to the tree structure at the specified target location.
 * Supports positioning options for ordering nodes within parent containers.
 *
 * @param {Object} state - The current state object
 * @param {Object} payload - Action payload
 * @param {string} payload.target - Path to the target tree data (e.g., 'fileExplorer')
 * @param {Object} payload.value - Node data containing the node properties (must include id)
 * @param {string} payload.value.id - Unique identifier for the new node
 * @param {Object} [payload.options] - Configuration options for the operation
 * @param {string} [payload.options.parent='_root'] - ID of parent node ('_root' for root level)
 * @param {string|Object} [payload.options.position='first'] - Position specification:
 *   - 'first': Insert at beginning (default)
 *   - 'last': Insert at end
 *   - { after: 'nodeId' }: Insert after specified node
 *   - { before: 'nodeId' }: Insert before specified node
 * @returns {Object} New state with the node added
 *
 * @example
 * // Simple root addition
 * treePush(state, {
 *   target: 'fileExplorer',
 *   value: { id: 'folder1', name: 'New Folder', type: 'folder' }
 * });
 *
 * @example
 * // Complex nested insertion
 * treePush(state, {
 *   target: 'fileExplorer',
 *   value: { id: 'file1', name: 'File.txt', type: 'file' },
 *   options: { parent: 'folder1', position: { after: 'existingFile' } }
 * });
 */
/**
 * @param {JsonObject} state
 * @param {TreePushPayload} payload
 * @returns {JsonObject}
 */
export const treePush = (state, payload) => {
  const { target, value, options = {} } = payload;
  const { parent = "_root", position = "first" } = options;
  const newState = structuredClone(state);
  const targetData = get(newState, target);

  // Ensure tree and items exist
  if (!targetData.tree) {
    targetData.tree = [];
  }
  if (!targetData.items) {
    targetData.items = {};
  }

  // Add item to items object
  targetData.items[value.id] = { ...value };
  delete targetData.items[value.id].id; // Remove id from item data

  // Create tree node
  const newNode = {
    id: value.id,
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

/**
 * Removes a node and all its children from the tree structure.
 * Cascades deletion to remove all descendants and their item data.
 *
 * @param {Object} state - The current state object
 * @param {Object} payload - Action payload
 * @param {string} payload.target - Path to the target tree data (e.g., 'fileExplorer')
 * @param {Object} [payload.options] - Configuration options for the operation
 * @param {string} payload.options.id - ID of the node to delete
 * @returns {Object} New state with the node and all children removed
 *
 * @example
 * treeDelete(state, { target: 'fileExplorer', options: { id: 'folder1' } });
 * // This will delete 'folder1' and all its children from both tree and items
 */
/**
 * @param {JsonObject} state
 * @param {TreeDeletePayload} payload
 * @returns {JsonObject}
 */
export const treeDelete = (state, payload) => {
  const { target, options = {} } = payload;
  const { id } = options;
  const newState = structuredClone(state);
  const targetData = get(newState, target);

  // Ensure tree and items exist
  if (!targetData.tree) {
    targetData.tree = [];
  }
  if (!targetData.items) {
    targetData.items = {};
  }

  // Collect all descendant IDs before removing from tree
  const descendantIds = collectDescendantIds(targetData.tree, id);

  // Remove from tree
  removeNodeFromTree(targetData.tree, id);

  // Remove the target node and all its descendants from items
  delete targetData.items[id];
  for (const descendantId of descendantIds) {
    delete targetData.items[descendantId];
  }

  return newState;
};

/**
 * Updates the properties of an existing node in the tree structure.
 * Supports both partial merges and full replacement of item data.
 *
 * @param {Object} state - The current state object
 * @param {Object} payload - Action payload
 * @param {string} payload.target - Path to the target tree data (e.g., 'fileExplorer')
 * @param {Object} payload.value - New item data to apply
 * @param {Object} [payload.options] - Configuration options for the operation
 * @param {string} payload.options.id - ID of the node to update
 * @param {boolean} [payload.options.replace=false] - If true, replaces entire item data. If false, merges properties
 * @returns {Object} New state with the node properties updated
 *
 * @example
 * // Partial update - merges with existing properties
 * treeUpdate(state, {
 *   target: 'fileExplorer',
 *   value: { name: 'Renamed Folder', color: 'blue' },
 *   options: { id: 'folder1', replace: false }
 * });
 *
 * @example
 * // Full replacement - overwrites all properties
 * treeUpdate(state, {
 *   target: 'fileExplorer',
 *   value: { name: 'New Folder', type: 'folder', created: '2024-01-01' },
 *   options: { id: 'folder1', replace: true }
 * });
 */
/**
 * @param {JsonObject} state
 * @param {TreeUpdatePayload} payload
 * @returns {JsonObject}
 */
export const treeUpdate = (state, payload) => {
  const { target, value, options = {} } = payload;
  const { id, replace = false } = options;
  const newState = structuredClone(state);
  const targetData = get(newState, target);

  if (replace) {
    // Full replace
    targetData.items[id] = { ...value };
    delete targetData.items[id].id;
  } else {
    // Partial update
    targetData.items[id] = { ...targetData.items[id], ...value };
    delete targetData.items[id].id;
  }

  return newState;
};

/**
 * Moves a node from one position to another in the tree structure.
 *
 * @param {Object} state - The current state object
 * @param {Object} payload - Action payload
 * @param {string} payload.target - Path to the target tree data (e.g., 'fileExplorer')
 * @param {Object} [payload.options] - Configuration options for the operation
 * @param {string} payload.options.id - ID of the node to move
 * @param {string} [payload.options.parent='_root'] - ID of the new parent node ('_root' for root level)
 * @param {string|Object} [payload.options.position='first'] - Position specification:
 *   - 'first': Insert at the beginning
 *   - 'last': Insert at the end
 *   - { after: 'nodeId' }: Insert after the specified node
 *   - { before: 'nodeId' }: Insert before the specified node
 * @returns {Object} New state with the node moved to its new position
 *
 * @example
 * // Move node 'file1' to root level at the beginning
 * const newState = treeMove(state, {
 *   target: 'fileExplorer',
 *   options: { id: 'file1', parent: '_root', position: 'first' }
 * });
 *
 * @example
 * // Move node 'file2' to root level at the end
 * const newState = treeMove(state, {
 *   target: 'fileExplorer',
 *   options: { id: 'file2', parent: '_root', position: 'last' }
 * });
 *
 * @example
 * // Move node 'file3' after 'folder1'
 * const newState = treeMove(state, {
 *   target: 'fileExplorer',
 *   options: { id: 'file3', parent: '_root', position: { after: 'folder1' } }
 * });
 *
 * @example
 * // Move node 'file4' before 'file5' in 'folder2'
 * const newState = treeMove(state, {
 *   target: 'fileExplorer',
 *   options: { id: 'file4', parent: 'folder2', position: { before: 'file5' } }
 * });
 */
/**
 * Initializes the entire state with the provided data.
 * Replaces the entire state with the new state object.
 * This is typically used as the first event to set up the initial state.
 *
 * @param {Object} state - The current state object
 * @param {Object} payload - Action payload
 * @param {Object} payload.value - The new state to set (will replace entire current state)
 * @returns {Object} New state object with the entire state replaced
 *
 * @example
 * init(state, {
 *   value: {
 *     explorer: { items: {}, tree: [] },
 *     settings: { theme: 'dark' }
 *   }
 * });
 */
/**
 * @param {JsonObject} _state
 * @param {InitPayload} payload
 * @returns {JsonObject}
 */
export const init = (_state, payload) => {
  const { value } = payload;
  return structuredClone(value);
};

/**
 * @param {JsonObject} state
 * @param {TreeMovePayload} payload
 * @returns {JsonObject}
 */
export const treeMove = (state, payload) => {
  const { target, options = {} } = payload;
  const { id, parent = "_root", position = "first" } = options;
  const newState = structuredClone(state);
  const targetData = get(newState, target);

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
