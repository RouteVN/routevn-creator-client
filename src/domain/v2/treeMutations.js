export const ROOT_TREE_PARENT_ID = "_root";

const normalizeTreeNodes = (nodes) => {
  if (!Array.isArray(nodes)) return [];
  return nodes
    .filter((node) => node && typeof node.id === "string")
    .map((node) => {
      const children = normalizeTreeNodes(node.children);
      return children.length > 0 ? { id: node.id, children } : { id: node.id };
    });
};

const normalizePosition = (position, fallback = "first") => {
  if (position === "first" || position === "last") return position;
  if (
    position &&
    typeof position === "object" &&
    (typeof position.before === "string" || typeof position.after === "string")
  ) {
    return position;
  }
  return fallback;
};

const insertNodeAtPosition = (nodes, node, position = "first") => {
  const list = Array.isArray(nodes) ? nodes : [];
  const resolvedPosition = normalizePosition(position, "first");

  if (resolvedPosition === "first") {
    list.unshift(node);
    return;
  }
  if (resolvedPosition === "last") {
    list.push(node);
    return;
  }

  if (resolvedPosition.before) {
    const index = list.findIndex(
      (entry) => entry.id === resolvedPosition.before,
    );
    if (index === -1) {
      list.unshift(node);
      return;
    }
    list.splice(index, 0, node);
    return;
  }

  if (resolvedPosition.after) {
    const index = list.findIndex(
      (entry) => entry.id === resolvedPosition.after,
    );
    if (index === -1) {
      list.push(node);
      return;
    }
    list.splice(index + 1, 0, node);
    return;
  }

  list.unshift(node);
};

const withChildren = (node, children) =>
  Array.isArray(children) && children.length > 0
    ? { id: node.id, children }
    : { id: node.id };

const insertNodeIntoTree = ({ treeNodes, parentId, node, position }) => {
  const normalizedNodes = normalizeTreeNodes(treeNodes);
  if (parentId === ROOT_TREE_PARENT_ID) {
    const nextRoot = [...normalizedNodes];
    insertNodeAtPosition(nextRoot, node, position);
    return { treeNodes: nextRoot, inserted: true };
  }

  let inserted = false;
  const nextNodes = normalizedNodes.map((entry) => {
    if (entry.id === parentId) {
      const children = [...normalizeTreeNodes(entry.children)];
      insertNodeAtPosition(children, node, position);
      inserted = true;
      return withChildren(entry, children);
    }

    if (Array.isArray(entry.children) && entry.children.length > 0) {
      const nested = insertNodeIntoTree({
        treeNodes: entry.children,
        parentId,
        node,
        position,
      });
      if (nested.inserted) {
        inserted = true;
        return withChildren(entry, nested.treeNodes);
      }
    }

    return entry;
  });

  return { treeNodes: nextNodes, inserted };
};

const collectNodeIds = (node, output) => {
  if (!node || typeof node.id !== "string") return;
  output.push(node.id);
  const children = Array.isArray(node.children) ? node.children : [];
  for (const child of children) {
    collectNodeIds(child, output);
  }
};

const removeNodeFromTree = ({ treeNodes, nodeId }) => {
  const normalizedNodes = normalizeTreeNodes(treeNodes);
  let removedNode = null;
  let removedIds = [];

  const nextNodes = [];
  for (const node of normalizedNodes) {
    if (node.id === nodeId) {
      removedNode = node;
      const ids = [];
      collectNodeIds(node, ids);
      removedIds = ids;
      continue;
    }

    if (Array.isArray(node.children) && node.children.length > 0) {
      const nested = removeNodeFromTree({
        treeNodes: node.children,
        nodeId,
      });
      if (nested.removedNode) {
        removedNode = nested.removedNode;
        removedIds = nested.removedIds;
        nextNodes.push(withChildren(node, nested.treeNodes));
        continue;
      }
    }

    nextNodes.push(node);
  }

  return { treeNodes: nextNodes, removedNode, removedIds };
};

export const insertTreeItem = ({
  treeCollection,
  value,
  parentId = ROOT_TREE_PARENT_ID,
  position = "first",
}) => {
  const nextCollection = structuredClone(treeCollection || {});
  nextCollection.items = nextCollection.items || {};
  nextCollection.tree = normalizeTreeNodes(nextCollection.tree);

  if (!value?.id) return nextCollection;

  nextCollection.items[value.id] = { ...value };
  delete nextCollection.items[value.id].id;

  const newNode = { id: value.id };
  const inserted = insertNodeIntoTree({
    treeNodes: nextCollection.tree,
    parentId,
    node: newNode,
    position: normalizePosition(position, "first"),
  });
  nextCollection.tree = inserted.treeNodes;
  return nextCollection;
};

export const updateTreeItem = ({
  treeCollection,
  id,
  value,
  replace = false,
}) => {
  const nextCollection = structuredClone(treeCollection || {});
  nextCollection.items = nextCollection.items || {};
  nextCollection.tree = normalizeTreeNodes(nextCollection.tree);

  if (replace) {
    nextCollection.items[id] = { ...value };
  } else {
    nextCollection.items[id] = {
      ...nextCollection.items[id],
      ...value,
    };
  }

  if (nextCollection.items[id]) {
    delete nextCollection.items[id].id;
  }
  return nextCollection;
};

export const deleteTreeItem = ({ treeCollection, id }) => {
  const nextCollection = structuredClone(treeCollection || {});
  nextCollection.items = nextCollection.items || {};
  nextCollection.tree = normalizeTreeNodes(nextCollection.tree);

  const removed = removeNodeFromTree({
    treeNodes: nextCollection.tree,
    nodeId: id,
  });
  nextCollection.tree = removed.treeNodes;

  for (const removedId of removed.removedIds) {
    delete nextCollection.items[removedId];
  }

  return nextCollection;
};

export const moveTreeItem = ({
  treeCollection,
  id,
  parentId = ROOT_TREE_PARENT_ID,
  position = "first",
}) => {
  const nextCollection = structuredClone(treeCollection || {});
  nextCollection.items = nextCollection.items || {};
  nextCollection.tree = normalizeTreeNodes(nextCollection.tree);

  const removed = removeNodeFromTree({
    treeNodes: nextCollection.tree,
    nodeId: id,
  });
  nextCollection.tree = removed.treeNodes;
  if (!removed.removedNode) return nextCollection;

  const inserted = insertNodeIntoTree({
    treeNodes: nextCollection.tree,
    parentId,
    node: removed.removedNode,
    position: normalizePosition(position, "first"),
  });
  nextCollection.tree = inserted.treeNodes;
  return nextCollection;
};
