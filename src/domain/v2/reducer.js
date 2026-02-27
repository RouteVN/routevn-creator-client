import { touchUpdatedAt } from "./model.js";
import {
  insertAtIndex,
  normalizeIndex,
  removeFromArray,
  upsertNoDuplicate,
} from "./utils.js";

const getLayoutElementChildren = (layout, parentId) => {
  if (!parentId) return layout.rootElementOrder;
  const parent = layout.elements[parentId];
  if (!parent.children) parent.children = [];
  return parent.children;
};

const sortIdsByCreatedAt = (order, items) => {
  order.sort((a, b) => {
    const aTs = items[a]?.createdAt ?? 0;
    const bTs = items[b]?.createdAt ?? 0;
    if (aTs !== bTs) return aTs - bTs;
    if (a === b) return 0;
    return a < b ? -1 : 1;
  });
};

const insertStableByCreatedAt = ({ order, id, index, items }) => {
  if (Number.isInteger(index)) {
    insertAtIndex(order, id, normalizeIndex(index));
    return;
  }
  upsertNoDuplicate(order, id);
  sortIdsByCreatedAt(order, items);
};

const cascadeDeleteScene = (state, sceneId) => {
  const scene = state.scenes[sceneId];
  if (!scene) return;

  for (const sectionId of scene.sectionIds || []) {
    const section = state.sections[sectionId];
    if (!section) continue;
    for (const lineId of section.lineIds || []) {
      delete state.lines[lineId];
    }
    delete state.sections[sectionId];
  }

  delete state.scenes[sceneId];
  removeFromArray(state.story.sceneOrder, sceneId);

  if (state.story.initialSceneId === sceneId) {
    state.story.initialSceneId = state.story.sceneOrder[0] || null;
  }
};

const ensureCollectionTree = (collection) => {
  if (!collection || typeof collection !== "object") {
    return [];
  }
  if (!Array.isArray(collection.tree)) {
    collection.tree = [];
  }
  return collection.tree;
};

const walkHierarchy = (nodes, parentId, visitor) => {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    if (!node || typeof node.id !== "string" || node.id.length === 0) {
      continue;
    }
    visitor(node, parentId);
    walkHierarchy(node.children || [], node.id, visitor);
  }
};

const flattenHierarchyIds = (nodes) => {
  const ids = [];
  walkHierarchy(nodes, null, (node) => {
    ids.push(node.id);
  });
  return ids;
};

const findHierarchyNodeById = (nodes, nodeId) => {
  if (!Array.isArray(nodes)) return null;
  for (const node of nodes) {
    if (!node || typeof node.id !== "string") continue;
    if (node.id === nodeId) return node;
    const found = findHierarchyNodeById(node.children || [], nodeId);
    if (found) return found;
  }
  return null;
};

const removeHierarchyNode = (nodes, nodeId) => {
  if (!Array.isArray(nodes)) return null;
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (!node || typeof node.id !== "string") continue;
    if (node.id === nodeId) {
      nodes.splice(index, 1);
      return node;
    }
    const removed = removeHierarchyNode(node.children || [], nodeId);
    if (removed) return removed;
  }
  return null;
};

const collectHierarchyNodeIds = (node, out = new Set()) => {
  if (!node || typeof node.id !== "string") return out;
  out.add(node.id);
  for (const child of node.children || []) {
    collectHierarchyNodeIds(child, out);
  }
  return out;
};

const resolveCollectionParentId = ({ items, itemId, parentId }) => {
  if (typeof parentId !== "string" || parentId.length === 0) return null;
  if (parentId === itemId) return null;
  return items?.[parentId] ? parentId : null;
};

const getCollectionSiblingNodes = ({ collection, parentId }) => {
  const tree = ensureCollectionTree(collection);
  if (!parentId) return tree;

  const parentNode = findHierarchyNodeById(tree, parentId);
  if (!parentNode) return tree;
  if (!Array.isArray(parentNode.children)) {
    parentNode.children = [];
  }
  return parentNode.children;
};

const resolveInsertionIndexFromPosition = ({
  collection,
  parentId,
  position,
  movingId = null,
}) => {
  if (position === "first") return 0;
  if (position === "last" || position === undefined || position === null) {
    return undefined;
  }

  const siblings = getCollectionSiblingNodes({ collection, parentId });
  const filteredSiblings = Array.isArray(siblings)
    ? siblings.filter((node) => node?.id && node.id !== movingId)
    : [];

  if (position && typeof position === "object") {
    if (typeof position.before === "string") {
      const beforeIndex = filteredSiblings.findIndex(
        (node) => node.id === position.before,
      );
      return beforeIndex >= 0 ? beforeIndex : filteredSiblings.length;
    }

    if (typeof position.after === "string") {
      const afterIndex = filteredSiblings.findIndex(
        (node) => node.id === position.after,
      );
      return afterIndex >= 0 ? afterIndex + 1 : filteredSiblings.length;
    }
  }

  return undefined;
};

const buildCanonicalCollectionTree = ({ items, tree }) => {
  const ROOT = "__root__";
  const allIds = Object.keys(items || {});
  const idSet = new Set(allIds);
  const orderedIds = [];
  const seen = new Set();

  for (const id of flattenHierarchyIds(tree)) {
    if (!idSet.has(id) || seen.has(id)) continue;
    seen.add(id);
    orderedIds.push(id);
  }
  for (const id of allIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    orderedIds.push(id);
  }

  const rawParentById = new Map();
  for (const id of allIds) {
    const rawParentId = items[id]?.parentId;
    rawParentById.set(
      id,
      resolveCollectionParentId({ items, itemId: id, parentId: rawParentId }),
    );
  }

  const resolvedParentById = new Map();
  const resolveParentId = (id, path = new Set()) => {
    if (resolvedParentById.has(id)) return resolvedParentById.get(id);
    const parentId = rawParentById.get(id) || null;
    if (!parentId) {
      resolvedParentById.set(id, null);
      return null;
    }
    if (path.has(parentId)) {
      resolvedParentById.set(id, null);
      return null;
    }
    const nextPath = new Set(path);
    nextPath.add(id);
    resolveParentId(parentId, nextPath);
    resolvedParentById.set(id, parentId);
    return parentId;
  };

  for (const id of allIds) {
    resolveParentId(id);
  }

  const childrenByParent = new Map();
  childrenByParent.set(ROOT, []);
  for (const id of orderedIds) {
    const parentId = resolvedParentById.get(id) ?? null;
    if (items[id]) {
      items[id].parentId = parentId;
    }
    const key = parentId || ROOT;
    if (!childrenByParent.has(key)) {
      childrenByParent.set(key, []);
    }
    childrenByParent.get(key).push(id);
  }

  const buildNodes = (parentKey) => {
    const ids = childrenByParent.get(parentKey) || [];
    return ids.map((id) => {
      const children = buildNodes(id);
      if (children.length > 0) {
        return { id, children };
      }
      return { id };
    });
  };

  return buildNodes(ROOT);
};

const placeCollectionNode = ({
  collection,
  itemId,
  parentId,
  index,
  node = null,
}) => {
  const tree = ensureCollectionTree(collection);
  const items = collection.items || {};
  const extractedNode = removeHierarchyNode(tree, itemId) ||
    node || { id: itemId };
  const targetParentId = resolveCollectionParentId({
    items,
    itemId,
    parentId,
  });

  let siblings = tree;
  let appliedParentId = null;
  if (targetParentId) {
    const parentNode = findHierarchyNodeById(tree, targetParentId);
    if (parentNode) {
      if (!Array.isArray(parentNode.children)) {
        parentNode.children = [];
      }
      siblings = parentNode.children;
      appliedParentId = targetParentId;
    }
  }

  insertAtIndex(siblings, extractedNode, normalizeIndex(index));
  if (items[itemId]) {
    items[itemId].parentId = appliedParentId;
  }
  collection.tree = buildCanonicalCollectionTree({ items, tree });
};

const collectCollectionDescendantIds = ({
  collection,
  rootId,
  includeRoot = true,
}) => {
  const ids = new Set();
  if (includeRoot) {
    ids.add(rootId);
  }

  const removedNode = removeHierarchyNode(
    ensureCollectionTree(collection),
    rootId,
  );
  if (removedNode) {
    collectHierarchyNodeIds(removedNode, ids);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const [itemId, item] of Object.entries(collection.items || {})) {
      if (ids.has(itemId)) continue;
      const parentId = item?.parentId;
      if (!parentId || !ids.has(parentId)) continue;
      ids.add(itemId);
      changed = true;
    }
  }
  return ids;
};

const normalizeLayoutParentId = (parentId, elementId) => {
  if (typeof parentId !== "string" || parentId.length === 0) return null;
  if (parentId === elementId) return null;
  return parentId;
};

const resolveLayoutParentId = ({ state, layoutId, parentId }) => {
  if (typeof parentId !== "string" || parentId.length === 0) return null;
  if (parentId === layoutId) return null;
  return state.layouts?.[parentId] ? parentId : null;
};

const walkLayoutHierarchy = (nodes, parentId, visitor) => {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    if (!node || typeof node.id !== "string" || node.id.length === 0) {
      continue;
    }
    visitor(node, parentId);
    walkLayoutHierarchy(node.children || [], node.id, visitor);
  }
};

const toLayoutElementsFromRepositoryCollection = (repositoryElements) => {
  const sourceCollection = repositoryElements || { items: {}, tree: [] };
  const sourceItems = sourceCollection.items || {};
  const parentById = new Map();
  const orderedIds = [];

  walkLayoutHierarchy(sourceCollection.tree || [], null, (node, parentId) => {
    if (!parentById.has(node.id)) {
      parentById.set(node.id, parentId);
    }
    orderedIds.push(node.id);
  });

  const allIds = [...new Set([...orderedIds, ...Object.keys(sourceItems)])];
  const elements = {};

  for (const id of allIds) {
    const repositoryElement = sourceItems[id];
    const clone = structuredClone(repositoryElement || {});
    delete clone.children;
    const parentId = normalizeLayoutParentId(
      parentById.has(id) ? parentById.get(id) : repositoryElement?.parentId,
      id,
    );
    elements[id] = {
      id,
      ...clone,
      parentId,
      children: [],
    };
  }

  for (const id of allIds) {
    const element = elements[id];
    if (!element) continue;
    const parentId = element.parentId;
    if (!parentId || !elements[parentId]) continue;
    elements[parentId].children.push(id);
  }

  const rootElementOrder = [];
  const seenRoots = new Set();
  for (const id of orderedIds) {
    const element = elements[id];
    if (!element) continue;
    const hasParent =
      typeof element.parentId === "string" && !!elements[element.parentId];
    if (hasParent || seenRoots.has(id)) continue;
    seenRoots.add(id);
    rootElementOrder.push(id);
  }
  for (const id of Object.keys(elements)) {
    if (seenRoots.has(id)) continue;
    const element = elements[id];
    const hasParent =
      typeof element.parentId === "string" && !!elements[element.parentId];
    if (hasParent) continue;
    seenRoots.add(id);
    rootElementOrder.push(id);
  }

  return {
    elements,
    rootElementOrder,
  };
};

const reducers = {
  "project.updated": ({ state, payload }) => {
    const patch = structuredClone(payload.patch || {});
    delete patch.id;
    delete patch.createdAt;
    delete patch.updatedAt;
    state.project = { ...state.project, ...patch };
  },

  "scene.created": ({ state, payload, now }) => {
    state.scenes[payload.sceneId] = {
      id: payload.sceneId,
      name: payload.name,
      sectionIds: [],
      createdAt: now,
      updatedAt: now,
    };
    insertStableByCreatedAt({
      order: state.story.sceneOrder,
      id: payload.sceneId,
      index: payload.index,
      items: state.scenes,
    });

    if (!state.story.initialSceneId) {
      state.story.initialSceneId = payload.sceneId;
    }
  },

  "scene.updated": ({ state, payload, now }) => {
    const current = state.scenes[payload.sceneId];
    const patch = structuredClone(payload.patch || {});
    delete patch.id;
    delete patch.sectionIds;
    state.scenes[payload.sceneId] = {
      ...current,
      ...patch,
      updatedAt: now,
    };
  },

  "scene.renamed": ({ state, payload, now }) => {
    state.scenes[payload.sceneId].name = payload.name;
    state.scenes[payload.sceneId].updatedAt = now;
  },

  "scene.deleted": ({ state, payload }) => {
    cascadeDeleteScene(state, payload.sceneId);
  },

  "scene.initial_set": ({ state, payload }) => {
    state.story.initialSceneId = payload.sceneId;
  },

  "scene.reordered": ({ state, payload }) => {
    upsertNoDuplicate(
      state.story.sceneOrder,
      payload.sceneId,
      normalizeIndex(payload.index),
    );
  },

  "section.created": ({ state, payload, now }) => {
    state.sections[payload.sectionId] = {
      id: payload.sectionId,
      sceneId: payload.sceneId,
      name: payload.name,
      lineIds: [],
      createdAt: now,
      updatedAt: now,
    };
    insertStableByCreatedAt({
      order: state.scenes[payload.sceneId].sectionIds,
      id: payload.sectionId,
      index: payload.index,
      items: state.sections,
    });
  },

  "section.renamed": ({ state, payload, now }) => {
    state.sections[payload.sectionId].name = payload.name;
    state.sections[payload.sectionId].updatedAt = now;
  },

  "section.deleted": ({ state, payload }) => {
    const section = state.sections[payload.sectionId];
    if (!section) return;
    for (const lineId of section.lineIds || []) {
      delete state.lines[lineId];
    }
    removeFromArray(
      state.scenes[section.sceneId].sectionIds,
      payload.sectionId,
    );
    delete state.sections[payload.sectionId];
  },

  "section.reordered": ({ state, payload }) => {
    const section = state.sections[payload.sectionId];
    upsertNoDuplicate(
      state.scenes[section.sceneId].sectionIds,
      payload.sectionId,
      normalizeIndex(payload.index),
    );
  },

  "line.inserted": ({ state, payload, now }) => {
    const section = state.sections[payload.sectionId];
    state.lines[payload.lineId] = {
      id: payload.lineId,
      sectionId: payload.sectionId,
      actions: payload.line.actions || {},
      createdAt: now,
      updatedAt: now,
    };

    if (payload.afterLineId !== undefined && payload.afterLineId !== null) {
      const afterIndex = section.lineIds.indexOf(payload.afterLineId);
      const insertIndex =
        afterIndex >= 0 ? afterIndex + 1 : section.lineIds.length;
      insertAtIndex(section.lineIds, payload.lineId, insertIndex);
    } else {
      insertStableByCreatedAt({
        order: section.lineIds,
        id: payload.lineId,
        items: state.lines,
      });
    }
  },

  "line.actions_updated": ({ state, payload, now }) => {
    const line = state.lines[payload.lineId];
    if (payload.replace === true) {
      line.actions = structuredClone(payload.patch);
    } else {
      line.actions = { ...line.actions, ...structuredClone(payload.patch) };
    }
    line.updatedAt = now;
  },

  "line.deleted": ({ state, payload }) => {
    const line = state.lines[payload.lineId];
    if (!line) return;
    removeFromArray(state.sections[line.sectionId].lineIds, payload.lineId);
    delete state.lines[payload.lineId];
  },

  "line.moved": ({ state, payload }) => {
    const line = state.lines[payload.lineId];
    removeFromArray(state.sections[line.sectionId].lineIds, payload.lineId);
    line.sectionId = payload.toSectionId;
    insertAtIndex(
      state.sections[payload.toSectionId].lineIds,
      payload.lineId,
      normalizeIndex(payload.index),
    );
  },

  "resource.created": ({ state, payload, now }) => {
    const collection = state.resources[payload.resourceType];
    ensureCollectionTree(collection);
    collection.items[payload.resourceId] = {
      id: payload.resourceId,
      ...structuredClone(payload.data),
      parentId: null,
      createdAt: now,
      updatedAt: now,
    };
    placeCollectionNode({
      collection,
      itemId: payload.resourceId,
      parentId: payload.parentId,
      index: payload.index,
    });
  },

  "resource.updated": ({ state, payload, now }) => {
    const collection = state.resources[payload.resourceType];
    const current = collection.items[payload.resourceId];
    const patch = structuredClone(payload.patch || {});
    delete patch.parentId;
    collection.items[payload.resourceId] = {
      ...current,
      ...patch,
    };
    collection.items[payload.resourceId].updatedAt = now;
    collection.tree = buildCanonicalCollectionTree({
      items: collection.items || {},
      tree: ensureCollectionTree(collection),
    });
  },

  "resource.renamed": ({ state, payload, now }) => {
    const item =
      state.resources[payload.resourceType].items[payload.resourceId];
    item.name = payload.name;
    item.updatedAt = now;
  },

  "resource.moved": ({ state, payload, now }) => {
    const collection = state.resources[payload.resourceType];
    const item = collection.items[payload.resourceId];
    ensureCollectionTree(collection);
    item.parentId = resolveCollectionParentId({
      items: collection.items || {},
      itemId: payload.resourceId,
      parentId: payload.parentId,
    });
    placeCollectionNode({
      collection,
      itemId: payload.resourceId,
      parentId: item.parentId,
      index: payload.index,
    });
    item.updatedAt = now;
  },

  "resource.deleted": ({ state, payload }) => {
    const collection = state.resources[payload.resourceType];
    ensureCollectionTree(collection);
    const idsToDelete = collectCollectionDescendantIds({
      collection,
      rootId: payload.resourceId,
      includeRoot: true,
    });
    for (const id of idsToDelete) {
      delete collection.items[id];
    }
    collection.tree = buildCanonicalCollectionTree({
      items: collection.items || {},
      tree: collection.tree,
    });
  },

  "resource.duplicated": ({ state, payload, now }) => {
    const collection = state.resources[payload.resourceType];
    const source = collection.items[payload.sourceId];
    const clone = structuredClone(source);
    clone.id = payload.newId;
    clone.name = `${source.name || "Resource"} Copy`;
    clone.createdAt = now;
    clone.updatedAt = now;
    collection.items[payload.newId] = clone;
    placeCollectionNode({
      collection,
      itemId: payload.newId,
      parentId: clone.parentId,
      index: payload.index,
    });
  },

  "layout.created": ({ state, payload, now }) => {
    const layoutData = structuredClone(payload.data || {});
    delete layoutData.id;
    delete layoutData.name;
    delete layoutData.layoutType;
    delete layoutData.elements;
    delete layoutData.rootElementOrder;
    delete layoutData.parentId;
    delete layoutData.position;
    delete layoutData.createdAt;
    delete layoutData.updatedAt;
    const parentId = resolveLayoutParentId({
      state,
      layoutId: payload.layoutId,
      parentId: payload.parentId,
    });

    const initialElements = toLayoutElementsFromRepositoryCollection(
      payload.elements,
    );
    state.layouts[payload.layoutId] = {
      id: payload.layoutId,
      name: payload.name,
      layoutType: payload.layoutType,
      ...layoutData,
      parentId,
      elements: initialElements.elements,
      rootElementOrder: initialElements.rootElementOrder,
      createdAt: now,
      updatedAt: now,
    };
  },

  "layout.renamed": ({ state, payload, now }) => {
    state.layouts[payload.layoutId].name = payload.name;
    state.layouts[payload.layoutId].updatedAt = now;
  },

  "layout.deleted": ({ state, payload }) => {
    delete state.layouts[payload.layoutId];
  },

  "layout.element.created": ({ state, payload, now }) => {
    const layout = state.layouts[payload.layoutId];
    layout.elements[payload.elementId] = {
      id: payload.elementId,
      ...structuredClone(payload.element),
      parentId: payload.parentId || null,
      children: [],
    };
    const targetChildren = getLayoutElementChildren(
      layout,
      payload.parentId || null,
    );
    insertAtIndex(
      targetChildren,
      payload.elementId,
      normalizeIndex(payload.index),
    );
    layout.updatedAt = now;
  },

  "layout.element.updated": ({ state, payload, now }) => {
    const layout = state.layouts[payload.layoutId];
    const element = layout.elements[payload.elementId];
    const patch = structuredClone(payload.patch);
    layout.elements[payload.elementId] = { ...element, ...patch };
    layout.updatedAt = now;
  },

  "layout.element.moved": ({ state, payload, now }) => {
    const layout = state.layouts[payload.layoutId];
    const element = layout.elements[payload.elementId];

    const currentChildren = getLayoutElementChildren(
      layout,
      element.parentId || null,
    );
    removeFromArray(currentChildren, payload.elementId);

    element.parentId = payload.parentId || null;
    const nextChildren = getLayoutElementChildren(
      layout,
      element.parentId || null,
    );
    insertAtIndex(
      nextChildren,
      payload.elementId,
      normalizeIndex(payload.index),
    );
    layout.updatedAt = now;
  },

  "layout.element.deleted": ({ state, payload, now }) => {
    const layout = state.layouts[payload.layoutId];
    const stack = [payload.elementId];

    while (stack.length > 0) {
      const id = stack.pop();
      const node = layout.elements[id];
      if (!node) continue;
      for (const childId of node.children || []) stack.push(childId);
      delete layout.elements[id];
    }

    for (const node of Object.values(layout.elements)) {
      if (Array.isArray(node.children)) {
        node.children = node.children.filter((id) => layout.elements[id]);
      }
    }
    layout.rootElementOrder = layout.rootElementOrder.filter(
      (id) => layout.elements[id],
    );
    layout.updatedAt = now;
  },

  "variable.created": ({ state, payload, now }) => {
    const variables = state.variables || { items: {}, tree: [] };
    const variableData = structuredClone(payload.data || {});
    variables.items[payload.variableId] = {
      id: payload.variableId,
      name: payload.name,
      itemType: "variable",
      type: payload.variableType,
      variableType: payload.variableType,
      default: structuredClone(payload.initialValue),
      value: structuredClone(payload.initialValue),
      parentId: null,
      ...variableData,
      createdAt: now,
      updatedAt: now,
    };
    const requestedParentId = resolveCollectionParentId({
      items: variables.items || {},
      itemId: payload.variableId,
      parentId: payload.parentId,
    });
    const index = Number.isInteger(payload.index)
      ? payload.index
      : resolveInsertionIndexFromPosition({
          collection: variables,
          parentId: requestedParentId,
          position: payload.position,
          movingId: payload.variableId,
        });
    placeCollectionNode({
      collection: variables,
      itemId: payload.variableId,
      parentId: requestedParentId,
      index,
    });
    state.variables = variables;
  },

  "variable.updated": ({ state, payload, now }) => {
    const variables = state.variables || { items: {}, tree: [] };
    const variable = variables.items[payload.variableId];
    const patch = structuredClone(payload.patch || {});
    const hasParentChange = Object.prototype.hasOwnProperty.call(
      patch,
      "parentId",
    );
    const requestedParentId = hasParentChange
      ? patch.parentId
      : variable?.parentId;
    delete patch.parentId;
    delete patch.type;
    delete patch.variableType;
    if (Object.prototype.hasOwnProperty.call(patch, "default")) {
      patch.value = structuredClone(patch.default);
    }
    variables.items[payload.variableId] = {
      ...variable,
      ...patch,
    };
    variables.items[payload.variableId].updatedAt = now;
    if (hasParentChange) {
      placeCollectionNode({
        collection: variables,
        itemId: payload.variableId,
        parentId: requestedParentId,
        index: payload.index,
      });
    } else {
      variables.tree = buildCanonicalCollectionTree({
        items: variables.items || {},
        tree: ensureCollectionTree(variables),
      });
    }
    state.variables = variables;
  },

  "variable.deleted": ({ state, payload }) => {
    const variables = state.variables || { items: {}, tree: [] };
    ensureCollectionTree(variables);
    const idsToDelete = collectCollectionDescendantIds({
      collection: variables,
      rootId: payload.variableId,
      includeRoot: true,
    });

    for (const variableId of idsToDelete) {
      delete variables.items[variableId];
    }
    variables.tree = buildCanonicalCollectionTree({
      items: variables.items || {},
      tree: variables.tree,
    });
    state.variables = variables;
  },
};

export const applyDomainEvent = (state, event) => {
  const reducer = reducers[event.type];
  if (!reducer) {
    throw new Error(`Unknown domain event type: ${event.type}`);
  }

  const now = Number.isFinite(event?.meta?.ts) ? event.meta.ts : Date.now();
  reducer({ state, payload: event.payload, now });
  touchUpdatedAt(state, now);
  return state;
};
