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

const reducers = {
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
    state.layouts[payload.layoutId] = {
      id: payload.layoutId,
      name: payload.name,
      layoutType: payload.layoutType,
      elements: {},
      rootElementOrder: [],
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
    state.variables[payload.variableId] = {
      id: payload.variableId,
      name: payload.name,
      variableType: payload.variableType,
      value: structuredClone(payload.initialValue),
      createdAt: now,
      updatedAt: now,
    };
  },

  "variable.updated": ({ state, payload, now }) => {
    const variable = state.variables[payload.variableId];
    state.variables[payload.variableId] = {
      ...variable,
      ...structuredClone(payload.patch),
    };
    state.variables[payload.variableId].updatedAt = now;
  },

  "variable.deleted": ({ state, payload }) => {
    delete state.variables[payload.variableId];
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
