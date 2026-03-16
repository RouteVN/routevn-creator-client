import {
  assertCommandPreconditions,
  assertFiniteNumber,
  commandToEvent,
  COMMAND_TYPES,
  deepClone,
  DomainInvariantError,
  insertAtIndex,
  MODEL_VERSION,
  normalizeCommand,
  normalizeIndex,
  removeFromArray,
  RESOURCE_TYPES,
  upsertNoDuplicate,
  validateCommand,
} from "./commands.js";

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
    state.story.initialSceneId =
      state.story.sceneOrder.find(
        (id) => state.scenes[id]?.type !== "folder",
      ) || null;
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

const isPlainObject = (value) => {
  return !!value && typeof value === "object" && !Array.isArray(value);
};

const mergePlainObjectPatch = (target, patch) => {
  if (!isPlainObject(patch)) {
    return structuredClone(patch);
  }

  const result = isPlainObject(target) ? structuredClone(target) : {};

  for (const [key, value] of Object.entries(patch)) {
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = mergePlainObjectPatch(result[key], value);
      continue;
    }

    result[key] = structuredClone(value);
  }

  return result;
};

const mergeLayoutElementPatch = (element, patch, elementId) => {
  const nextElement = mergePlainObjectPatch(element, patch);
  nextElement.id = nextElement.id || elementId;
  if (nextElement.parentId === undefined) {
    nextElement.parentId = element?.parentId ?? null;
  }
  if (!Array.isArray(nextElement.children)) {
    nextElement.children = structuredClone(element?.children || []);
  }
  return nextElement;
};

const replaceLayoutElement = (element, patch, elementId) => {
  const nextElement = structuredClone(patch || {});
  nextElement.id = nextElement.id || elementId;
  if (nextElement.parentId === undefined) {
    nextElement.parentId = element?.parentId ?? null;
  }
  if (!Array.isArray(nextElement.children)) {
    nextElement.children = structuredClone(element?.children || []);
  }
  return nextElement;
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
  const parent = state.resources?.layouts?.items?.[parentId];
  if (!parent || parent.type !== "folder") return null;
  return parentId;
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

const toDomainLayoutResource = ({
  resourceId,
  resourceData = {},
  now,
  parentId = null,
}) => {
  const layoutData = structuredClone(resourceData || {});
  delete layoutData.id;
  delete layoutData.name;
  delete layoutData.layoutType;
  delete layoutData.elements;
  delete layoutData.rootElementOrder;
  delete layoutData.parentId;
  delete layoutData.position;
  delete layoutData.createdAt;
  delete layoutData.updatedAt;
  const isFolder = layoutData.type === "folder";

  if (isFolder) {
    return {
      id: resourceId,
      name: resourceData.name,
      ...layoutData,
      type: "folder",
      parentId,
      createdAt: now,
      updatedAt: now,
    };
  }

  const initialElements = toLayoutElementsFromRepositoryCollection(
    resourceData.elements,
  );
  return {
    id: resourceId,
    name: resourceData.name,
    layoutType: resourceData.layoutType || "normal",
    ...layoutData,
    type: "layout",
    parentId,
    elements: initialElements.elements,
    rootElementOrder: initialElements.rootElementOrder,
    createdAt: now,
    updatedAt: now,
  };
};

const reducers = {
  [COMMAND_TYPES.PROJECT_CREATE]: ({ state, payload }) => {
    const nextState = structuredClone(payload?.state || {});
    for (const key of Object.keys(state)) {
      delete state[key];
    }
    Object.assign(state, nextState);
  },

  [COMMAND_TYPES.SCENE_CREATE]: ({ state, payload, now }) => {
    const sceneData = structuredClone(payload.data || {});
    const sceneType = sceneData.type === "folder" ? "folder" : "scene";
    state.scenes[payload.sceneId] = {
      id: payload.sceneId,
      name: sceneData.name,
      type: sceneType,
      sectionIds: [],
      parentId: typeof payload.parentId === "string" ? payload.parentId : null,
      ...sceneData,
      createdAt: now,
      updatedAt: now,
    };
    insertStableByCreatedAt({
      order: state.story.sceneOrder,
      id: payload.sceneId,
      index: payload.index,
      items: state.scenes,
    });

    if (!state.story.initialSceneId && sceneType !== "folder") {
      state.story.initialSceneId = payload.sceneId;
    }
  },

  [COMMAND_TYPES.SCENE_UPDATE]: ({ state, payload, now }) => {
    const current = state.scenes[payload.sceneId];
    const data = structuredClone(payload.data || {});
    delete data.id;
    delete data.sectionIds;
    delete data.type;
    state.scenes[payload.sceneId] = {
      ...current,
      ...data,
      updatedAt: now,
    };
  },

  [COMMAND_TYPES.SCENE_DELETE]: ({ state, payload }) => {
    cascadeDeleteScene(state, payload.sceneId);
  },

  [COMMAND_TYPES.SCENE_SET_INITIAL]: ({ state, payload }) => {
    state.story.initialSceneId = payload.sceneId;
  },

  [COMMAND_TYPES.SCENE_MOVE]: ({ state, payload }) => {
    upsertNoDuplicate(
      state.story.sceneOrder,
      payload.sceneId,
      normalizeIndex(payload.index),
    );
    state.scenes[payload.sceneId].parentId =
      typeof payload.parentId === "string" ? payload.parentId : null;
  },

  [COMMAND_TYPES.SECTION_CREATE]: ({ state, payload, now }) => {
    const sectionData = structuredClone(payload.data || {});
    state.sections[payload.sectionId] = {
      id: payload.sectionId,
      sceneId: payload.sceneId,
      name: sectionData.name,
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

  [COMMAND_TYPES.SECTION_UPDATE]: ({ state, payload, now }) => {
    const current = state.sections[payload.sectionId];
    const data = structuredClone(payload.data || {});
    delete data.id;
    delete data.sceneId;
    delete data.lineIds;
    state.sections[payload.sectionId] = {
      ...current,
      ...data,
      updatedAt: now,
    };
  },

  [COMMAND_TYPES.SECTION_DELETE]: ({ state, payload }) => {
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

  [COMMAND_TYPES.SECTION_MOVE]: ({ state, payload }) => {
    const section = state.sections[payload.sectionId];
    upsertNoDuplicate(
      state.scenes[section.sceneId].sectionIds,
      payload.sectionId,
      normalizeIndex(payload.index),
    );
  },

  [COMMAND_TYPES.LINE_INSERT_AFTER]: ({ state, payload, now }) => {
    const section = state.sections[payload.sectionId];
    const lineData = structuredClone(payload.data || {});
    state.lines[payload.lineId] = {
      id: payload.lineId,
      sectionId: payload.sectionId,
      actions: lineData.actions || {},
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

  [COMMAND_TYPES.LINE_UPDATE_ACTIONS]: ({ state, payload, now }) => {
    const line = state.lines[payload.lineId];
    if (payload.replace === true) {
      line.actions = structuredClone(payload.data);
    } else {
      line.actions = { ...line.actions, ...structuredClone(payload.data) };
    }
    line.updatedAt = now;
  },

  [COMMAND_TYPES.LINE_DELETE]: ({ state, payload }) => {
    const line = state.lines[payload.lineId];
    if (!line) return;
    removeFromArray(state.sections[line.sectionId].lineIds, payload.lineId);
    delete state.lines[payload.lineId];
  },

  [COMMAND_TYPES.LINE_MOVE]: ({ state, payload }) => {
    const line = state.lines[payload.lineId];
    removeFromArray(state.sections[line.sectionId].lineIds, payload.lineId);
    line.sectionId = payload.toSectionId;
    insertAtIndex(
      state.sections[payload.toSectionId].lineIds,
      payload.lineId,
      normalizeIndex(payload.index),
    );
  },

  [COMMAND_TYPES.RESOURCE_CREATE]: ({ state, payload, now }) => {
    const collection = state.resources[payload.resourceType];
    ensureCollectionTree(collection);
    const parentId =
      payload.resourceType === "layouts"
        ? resolveLayoutParentId({
            state,
            layoutId: payload.resourceId,
            parentId: payload.parentId,
          })
        : payload.parentId;
    collection.items[payload.resourceId] =
      payload.resourceType === "layouts"
        ? toDomainLayoutResource({
            resourceId: payload.resourceId,
            resourceData: payload.data,
            now,
            parentId,
          })
        : {
            id: payload.resourceId,
            ...structuredClone(payload.data),
            parentId: null,
            createdAt: now,
            updatedAt: now,
          };
    placeCollectionNode({
      collection,
      itemId: payload.resourceId,
      parentId,
      index: payload.index,
    });
  },

  [COMMAND_TYPES.RESOURCE_UPDATE]: ({ state, payload, now }) => {
    const collection = state.resources[payload.resourceType];
    const current = collection.items[payload.resourceId];
    const data = structuredClone(payload.data || {});
    delete data.parentId;
    collection.items[payload.resourceId] = {
      ...current,
      ...data,
    };
    collection.items[payload.resourceId].updatedAt = now;
    collection.tree = buildCanonicalCollectionTree({
      items: collection.items || {},
      tree: ensureCollectionTree(collection),
    });
  },

  [COMMAND_TYPES.RESOURCE_MOVE]: ({ state, payload, now }) => {
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

  [COMMAND_TYPES.RESOURCE_DELETE]: ({ state, payload }) => {
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

  [COMMAND_TYPES.RESOURCE_DUPLICATE]: ({ state, payload, now }) => {
    const collection = state.resources[payload.resourceType];
    const source = collection.items[payload.sourceId];
    const clone = structuredClone(source);
    clone.id = payload.newId;
    clone.name = payload.name || `${source.name || "Resource"} Copy`;
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

  [COMMAND_TYPES.LAYOUT_ELEMENT_CREATE]: ({ state, payload, now }) => {
    const layout = state.resources.layouts.items[payload.layoutId];
    layout.elements[payload.elementId] = {
      id: payload.elementId,
      ...structuredClone(payload.data),
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

  [COMMAND_TYPES.LAYOUT_ELEMENT_UPDATE]: ({ state, payload, now }) => {
    const layout = state.resources.layouts.items[payload.layoutId];
    const element = layout.elements[payload.elementId];
    if (payload.replace === true) {
      layout.elements[payload.elementId] = replaceLayoutElement(
        element,
        payload.data,
        payload.elementId,
      );
    } else {
      layout.elements[payload.elementId] = mergeLayoutElementPatch(
        element,
        payload.data,
        payload.elementId,
      );
    }
    layout.updatedAt = now;
  },

  [COMMAND_TYPES.LAYOUT_ELEMENT_MOVE]: ({ state, payload, now }) => {
    const layout = state.resources.layouts.items[payload.layoutId];
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

  [COMMAND_TYPES.LAYOUT_ELEMENT_DELETE]: ({ state, payload, now }) => {
    const layout = state.resources.layouts.items[payload.layoutId];
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

const createResourceCollection = () => ({
  items: {},
  tree: [],
});

const toFiniteTimestamp = (value, fallback = 0) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

export const createEmptyProjectState = ({
  projectId,
  name = "",
  description = "",
  timestamp = 0,
}) => {
  const resources = Object.fromEntries(
    RESOURCE_TYPES.map((type) => [type, createResourceCollection()]),
  );
  const createdAt = toFiniteTimestamp(timestamp, 0);

  return {
    model_version: MODEL_VERSION,
    project: {
      id: projectId,
      name,
      description,
      createdAt,
      updatedAt: createdAt,
    },
    story: {
      initialSceneId: null,
      sceneOrder: [],
    },
    scenes: {},
    sections: {},
    lines: {},
    resources,
  };
};

export const isUuidLike = (value) =>
  typeof value === "string" && value.length >= 8;

export const touchUpdatedAt = (state, timestamp = 0) => {
  if (!state.project) return;
  const current =
    typeof state.project.updatedAt === "number" ? state.project.updatedAt : 0;
  state.project.updatedAt = Math.max(current, toFiniteTimestamp(timestamp, 0));
};

const fail = (message, details = {}) => {
  throw new DomainInvariantError(message, details);
};

const ensureUnique = (array, label) => {
  const set = new Set(array);
  if (set.size !== array.length) {
    fail(`Duplicate ids in ${label}`, { label, array });
  }
};

const walkInvariantHierarchy = (nodes, parentId, visitor) => {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    if (!node || typeof node.id !== "string" || node.id.length === 0) {
      fail("Invalid hierarchy node", { node, parentId });
    }
    visitor(node, parentId);
    walkInvariantHierarchy(node.children || [], node.id, visitor);
  }
};

const validateHierarchicalCollection = ({
  collection,
  collectionLabel,
  itemLabel,
}) => {
  if (
    !collection ||
    typeof collection !== "object" ||
    !collection.items ||
    typeof collection.items !== "object" ||
    !Array.isArray(collection.tree)
  ) {
    fail("Collection shape is invalid", { collectionLabel });
  }

  const parentById = new Map();
  walkInvariantHierarchy(collection.tree, null, (node, parentId) => {
    if (parentById.has(node.id)) {
      fail("Duplicate node id in tree", {
        collectionLabel,
        itemLabel,
        id: node.id,
      });
    }
    parentById.set(node.id, parentId);
  });

  for (const [id, parentId] of parentById.entries()) {
    if (!collection.items[id]) {
      fail("Tree references missing item", {
        collectionLabel,
        itemLabel,
        id,
        parentId,
      });
    }
  }

  for (const [id, item] of Object.entries(collection.items || {})) {
    if (!parentById.has(id)) {
      fail("Item missing from tree", {
        collectionLabel,
        itemLabel,
        id,
      });
    }
    const expectedParentId = parentById.get(id) ?? null;
    const actualParentId =
      typeof item?.parentId === "string" && item.parentId.length > 0
        ? item.parentId
        : null;
    if (actualParentId !== expectedParentId) {
      fail("Item parent mismatch with tree", {
        collectionLabel,
        itemLabel,
        id,
        expectedParentId,
        actualParentId,
      });
    }
  }
};

const validateLineActionReferences = (state) => {
  for (const line of Object.values(state.lines)) {
    const actions = line.actions || {};
    const sectionTransition =
      actions.sectionTransition || actions.actions?.sectionTransition;
    if (
      sectionTransition?.sceneId &&
      !state.scenes[sectionTransition.sceneId]
    ) {
      fail("Line references missing scene", {
        lineId: line.id,
        sceneId: sectionTransition.sceneId,
      });
    }

    const background = actions.background || actions.actions?.background;
    if (background?.resourceType === "layout" && background.resourceId) {
      if (!state.resources?.layouts?.items?.[background.resourceId]) {
        fail("Line references missing layout", {
          lineId: line.id,
          layoutId: background.resourceId,
        });
      }
    }
  }
};

const validateLayoutElementReferences = (state) => {
  const layoutItems = state.resources?.layouts?.items || {};
  for (const layout of Object.values(layoutItems)) {
    if (!layout || layout.type !== "layout") continue;
    ensureUnique(
      layout.rootElementOrder || [],
      `layout(${layout.id}).rootElementOrder`,
    );

    const placementCount = new Map();
    const bumpPlacement = (id) => {
      placementCount.set(id, (placementCount.get(id) || 0) + 1);
    };

    for (const rootId of layout.rootElementOrder || []) {
      if (!layout.elements[rootId]) {
        fail("Layout root references missing element", {
          layoutId: layout.id,
          rootId,
        });
      }
      bumpPlacement(rootId);
    }

    for (const element of Object.values(layout.elements || {})) {
      ensureUnique(
        element.children || [],
        `layout(${layout.id}).element(${element.id}).children`,
      );

      if (element.parentId) {
        const parent = layout.elements[element.parentId];
        if (!parent) {
          fail("Layout element references missing parent", {
            layoutId: layout.id,
            elementId: element.id,
            parentId: element.parentId,
          });
        }
        if (!(parent.children || []).includes(element.id)) {
          fail("Layout parent does not reference child", {
            layoutId: layout.id,
            elementId: element.id,
            parentId: element.parentId,
          });
        }
      }

      for (const childId of element.children || []) {
        if (!layout.elements[childId]) {
          fail("Layout element references missing child", {
            layoutId: layout.id,
            elementId: element.id,
            childId,
          });
        }
        if (layout.elements[childId].parentId !== element.id) {
          fail("Layout child parent mismatch", {
            layoutId: layout.id,
            elementId: element.id,
            childId,
            actualParentId: layout.elements[childId].parentId,
          });
        }
        bumpPlacement(childId);
      }

      for (const numericKey of [
        "x",
        "y",
        "width",
        "height",
        "rotation",
        "opacity",
      ]) {
        if (
          Object.prototype.hasOwnProperty.call(element, numericKey) &&
          !assertFiniteNumber(element[numericKey])
        ) {
          fail("Invalid numeric layout property", {
            layoutId: layout.id,
            elementId: element.id,
            key: numericKey,
            value: element[numericKey],
          });
        }
      }

      if (
        element.opacity !== undefined &&
        (element.opacity < 0 || element.opacity > 1)
      ) {
        fail("Layout opacity out of range", {
          layoutId: layout.id,
          elementId: element.id,
          opacity: element.opacity,
        });
      }
    }

    for (const elementId of Object.keys(layout.elements || {})) {
      const placements = placementCount.get(elementId) || 0;
      if (placements !== 1) {
        fail("Layout element must appear exactly once in order", {
          layoutId: layout.id,
          elementId,
          placements,
        });
      }
    }

    const visited = new Set();
    const visiting = new Set();
    const roots = layout.rootElementOrder || [];

    const walk = (id, path = []) => {
      if (visiting.has(id)) {
        fail("Layout cycle detected", {
          layoutId: layout.id,
          path: [...path, id],
        });
      }
      if (visited.has(id)) return;

      visiting.add(id);
      const node = layout.elements[id];
      if (!node) {
        fail("Layout traversal missing element", {
          layoutId: layout.id,
          elementId: id,
        });
      }

      for (const childId of node.children || []) {
        walk(childId, [...path, id]);
      }

      visiting.delete(id);
      visited.add(id);
    };

    for (const rootId of roots) {
      walk(rootId);
    }

    const totalElements = Object.keys(layout.elements || {}).length;
    if (visited.size !== totalElements) {
      const unreachable = Object.keys(layout.elements || {}).filter(
        (id) => !visited.has(id),
      );
      fail("Layout has unreachable elements", {
        layoutId: layout.id,
        unreachable,
      });
    }
  }
};

export const assertDomainInvariants = (state) => {
  if (state.model_version !== MODEL_VERSION) {
    fail("Unsupported model version", {
      expected: MODEL_VERSION,
      got: state.model_version,
    });
  }

  if (!state?.project?.id) {
    fail("Missing project id");
  }

  for (const resourceType of RESOURCE_TYPES) {
    if (!state.resources?.[resourceType]) {
      fail("Missing resource collection", { resourceType });
    }
  }

  for (const resourceType of Object.keys(state.resources || {})) {
    if (!RESOURCE_TYPES.includes(resourceType)) {
      fail("Unknown resource collection", { resourceType });
    }
  }

  ensureUnique(state.story.sceneOrder || [], "story.sceneOrder");

  if (state.story.initialSceneId && !state.scenes[state.story.initialSceneId]) {
    fail("initialSceneId does not exist", {
      initialSceneId: state.story.initialSceneId,
    });
  }

  for (const sceneId of state.story.sceneOrder) {
    if (!state.scenes[sceneId]) {
      fail("sceneOrder contains missing scene", { sceneId });
    }
  }

  for (const scene of Object.values(state.scenes)) {
    ensureUnique(scene.sectionIds || [], `scene(${scene.id}).sectionIds`);
    for (const sectionId of scene.sectionIds || []) {
      const section = state.sections[sectionId];
      if (!section) {
        fail("Scene references missing section", {
          sceneId: scene.id,
          sectionId,
        });
      }
      if (section.sceneId !== scene.id) {
        fail("Section parent mismatch", {
          sceneId: scene.id,
          sectionId,
          actualSceneId: section.sceneId,
        });
      }
    }
  }

  for (const section of Object.values(state.sections)) {
    if (!state.scenes[section.sceneId]) {
      fail("Section references missing parent scene", {
        sectionId: section.id,
        sceneId: section.sceneId,
      });
    }
    if (
      !(state.scenes[section.sceneId].sectionIds || []).includes(section.id)
    ) {
      fail("Section parent does not include section id", {
        sectionId: section.id,
        sceneId: section.sceneId,
      });
    }

    ensureUnique(section.lineIds || [], `section(${section.id}).lineIds`);
    for (const lineId of section.lineIds || []) {
      const line = state.lines[lineId];
      if (!line) {
        fail("Section references missing line", {
          sectionId: section.id,
          lineId,
        });
      }
      if (line.sectionId !== section.id) {
        fail("Line parent mismatch", {
          sectionId: section.id,
          lineId,
          actualSectionId: line.sectionId,
        });
      }
    }
  }

  for (const line of Object.values(state.lines)) {
    if (!state.sections[line.sectionId]) {
      fail("Line references missing parent section", {
        lineId: line.id,
        sectionId: line.sectionId,
      });
    }
    if (!(state.sections[line.sectionId].lineIds || []).includes(line.id)) {
      fail("Line parent does not include line id", {
        lineId: line.id,
        sectionId: line.sectionId,
      });
    }
  }

  for (const [resourceType, collection] of Object.entries(
    state.resources || {},
  )) {
    validateHierarchicalCollection({
      collection,
      collectionLabel: `resources.${resourceType}`,
      itemLabel: "resource",
    });
  }

  validateLineActionReferences(state);
  validateLayoutElementReferences(state);

  return true;
};

export const processCommand = ({ state, command }) => {
  const normalizedCommand = normalizeCommand(command);
  validateCommand(normalizedCommand);
  assertCommandPreconditions(state, normalizedCommand);

  const workingState = deepClone(state);
  const event = commandToEvent(normalizedCommand);

  applyDomainEvent(workingState, event);
  assertDomainInvariants(workingState);

  return {
    state: workingState,
    event,
  };
};
