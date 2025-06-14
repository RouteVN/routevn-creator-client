const set = (state, path, value) => {
  const newState = structuredClone(state);
  const keys = path.split(".");
  let current = newState;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    current[key] = { ...current[key] };
    current = current[key];
  }

  current[keys[keys.length - 1]] = value;
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
    if (tree[i] && tree[i].children && removeNodeFromTree(tree[i].children, nodeId)) {
      return true;
    }
  }
  return false;
};

// Tree manipulation functions
const treePush = (state, target, value) => {
  const newState = structuredClone(state);
  const targetData = get(newState, target);
  const { parent, item, previousSibling } = value;
  
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
    children: []
  };
  
  if (parent === '_root') {
    // Add to root level
    if (previousSibling) {
      const index = targetData.tree.findIndex(node => node.id === previousSibling);
      if (index !== -1) {
        targetData.tree.splice(index + 1, 0, newNode);
      } else {
        targetData.tree.push(newNode);
      }
    } else {
      targetData.tree.unshift(newNode);
    }
  } else {
    // Add to specific parent
    const parentInfo = findNodeInTree(targetData.tree, parent);
    if (parentInfo && parentInfo.node) {
      if (!parentInfo.node.children) {
        parentInfo.node.children = [];
      }
      if (previousSibling) {
        const index = parentInfo.node.children.findIndex(node => node.id === previousSibling);
        if (index !== -1) {
          parentInfo.node.children.splice(index + 1, 0, newNode);
        } else {
          parentInfo.node.children.push(newNode);
        }
      } else {
        parentInfo.node.children.unshift(newNode);
      }
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

const treeMove = (state, target, value) => {
  const newState = structuredClone(state);
  const targetData = get(newState, target);
  const { id, parent, previousSibling } = value;
  
  // Find and remove node from current position
  const nodeInfo = findNodeInTree(targetData.tree, id);
  if (!nodeInfo) return state;
  
  const nodeToMove = structuredClone(nodeInfo.node);
  removeNodeFromTree(targetData.tree, id);
  
  // Insert at new position
  if (parent === '_root') {
    if (previousSibling) {
      const index = targetData.tree.findIndex(node => node.id === previousSibling);
      if (index !== -1) {
        targetData.tree.splice(index + 1, 0, nodeToMove);
      } else {
        targetData.tree.push(nodeToMove);
      }
    } else {
      targetData.tree.unshift(nodeToMove);
    }
  } else {
    const parentInfo = findNodeInTree(targetData.tree, parent);
    if (parentInfo && parentInfo.node) {
      if (!parentInfo.node.children) {
        parentInfo.node.children = [];
      }
      if (previousSibling) {
        const index = parentInfo.node.children.findIndex(node => node.id === previousSibling);
        if (index !== -1) {
          parentInfo.node.children.splice(index + 1, 0, nodeToMove);
        } else {
          parentInfo.node.children.push(nodeToMove);
        }
      } else {
        parentInfo.node.children.unshift(nodeToMove);
      }
    }
  }
  
  return newState;
};

export const createRepository = (initialState, initialActionSteams) => {
  const actionStream = initialActionSteams || [];

  const addAction = (action) => {
    actionStream.push(action);
  };

  const getState = () => {
    return actionStream.reduce((acc, action) => {
      const { actionType, target, value } = action;
      if (actionType === "set") {
        return set(acc, target, value);
      } else if (actionType === "treePush") {
        return treePush(acc, target, value);
      } else if (actionType === "treeDelete") {
        return treeDelete(acc, target, value);
      } else if (actionType === "treeUpdate") {
        return treeUpdate(acc, target, value);
      } else if (actionType === "treeMove") {
        return treeMove(acc, target, value);
      }
      return acc;
    }, structuredClone(initialState));
  };

  return {
    addAction,
    getState,
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
    const parentLabels = parentChain.map(parentId => items[parentId]?.name).filter(Boolean);
    const fullLabel = parentLabels.length > 0 
      ? `${parentLabels.join(' > ')} > ${items[node.id]?.name || ''}`
      : items[node.id]?.name || '';

    const item = {
      ...items[node.id],
      id: node.id,
      _level: level,
      fullLabel,
    };
    flatItems.push(item);

    if (node.children) {
      const newParentChain = [...parentChain, node.id];
      node.children.forEach((child) => traverse(child, level + 1, newParentChain));
    }
  };

  tree.forEach((node) => traverse(node));
  return flatItems;
};
