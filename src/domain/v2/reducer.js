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

const collectVariableDescendantIds = (variables, rootId) => {
  const descendants = [];
  const queue = [rootId];
  while (queue.length > 0) {
    const currentId = queue.shift();
    for (const [variableId, variable] of Object.entries(
      variables.items || {},
    )) {
      if (variable?.parentId !== currentId) continue;
      descendants.push(variableId);
      queue.push(variableId);
    }
  }
  return descendants;
};

const normalizeLayoutParentId = (parentId, elementId) => {
  if (typeof parentId !== "string" || parentId.length === 0) return null;
  if (parentId === elementId) return null;
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

const toLayoutElementsFromLegacyCollection = (legacyElements) => {
  const source = legacyElements || { items: {}, order: [] };
  const sourceItems = source.items || {};
  const parentById = new Map();
  const orderedIds = [];

  walkLayoutHierarchy(source.order || [], null, (node, parentId) => {
    if (!parentById.has(node.id)) {
      parentById.set(node.id, parentId);
    }
    orderedIds.push(node.id);
  });

  const allIds = [...new Set([...orderedIds, ...Object.keys(sourceItems)])];
  const elements = {};

  for (const id of allIds) {
    const sourceElement = sourceItems[id];
    const clone = structuredClone(sourceElement || {});
    delete clone.children;
    const parentId = normalizeLayoutParentId(
      parentById.has(id) ? parentById.get(id) : sourceElement?.parentId,
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
    collection.items[payload.resourceId] = {
      id: payload.resourceId,
      ...structuredClone(payload.data),
      parentId: payload.parentId || null,
      createdAt: now,
      updatedAt: now,
    };
    insertStableByCreatedAt({
      order: collection.order,
      id: payload.resourceId,
      index: payload.index,
      items: collection.items,
    });
  },

  "resource.updated": ({ state, payload, now }) => {
    const collection = state.resources[payload.resourceType];
    const current = collection.items[payload.resourceId];
    collection.items[payload.resourceId] = {
      ...current,
      ...structuredClone(payload.patch || {}),
    };
    collection.items[payload.resourceId].updatedAt = now;
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
    item.parentId = payload.parentId || null;
    upsertNoDuplicate(
      collection.order,
      payload.resourceId,
      normalizeIndex(payload.index),
    );
    item.updatedAt = now;
  },

  "resource.deleted": ({ state, payload }) => {
    const collection = state.resources[payload.resourceType];
    removeFromArray(collection.order, payload.resourceId);
    delete collection.items[payload.resourceId];
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
    insertAtIndex(
      collection.order,
      payload.newId,
      normalizeIndex(payload.index),
    );
  },

  "layout.created": ({ state, payload, now }) => {
    const layoutData = structuredClone(payload.data || {});
    delete layoutData.id;
    delete layoutData.name;
    delete layoutData.layoutType;
    delete layoutData.elements;
    delete layoutData.rootElementOrder;
    delete layoutData.createdAt;
    delete layoutData.updatedAt;

    const initialElements = toLayoutElementsFromLegacyCollection(
      payload.elements,
    );
    state.layouts[payload.layoutId] = {
      id: payload.layoutId,
      name: payload.name,
      layoutType: payload.layoutType,
      ...layoutData,
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
    const variables = state.variables || { items: {}, order: [] };
    const variableData = structuredClone(payload.data || {});
    variables.items[payload.variableId] = {
      id: payload.variableId,
      name: payload.name,
      itemType: "variable",
      type: payload.variableType,
      variableType: payload.variableType,
      default: structuredClone(payload.initialValue),
      value: structuredClone(payload.initialValue),
      parentId: payload.parentId || null,
      ...variableData,
      createdAt: now,
      updatedAt: now,
    };
    insertAtIndex(
      variables.order,
      payload.variableId,
      normalizeIndex(payload.index),
    );
    state.variables = variables;
  },

  "variable.updated": ({ state, payload, now }) => {
    const variables = state.variables || { items: {}, order: [] };
    const variable = variables.items[payload.variableId];
    const patch = structuredClone(payload.patch || {});
    if (Object.prototype.hasOwnProperty.call(patch, "default")) {
      patch.value = structuredClone(patch.default);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "type")) {
      patch.variableType = patch.type;
    }
    variables.items[payload.variableId] = {
      ...variable,
      ...patch,
    };
    variables.items[payload.variableId].updatedAt = now;
    state.variables = variables;
  },

  "variable.deleted": ({ state, payload }) => {
    const variables = state.variables || { items: {}, order: [] };
    const idsToDelete = [
      payload.variableId,
      ...collectVariableDescendantIds(variables, payload.variableId),
    ];

    for (const variableId of idsToDelete) {
      removeFromArray(variables.order, variableId);
      delete variables.items[variableId];
    }
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
