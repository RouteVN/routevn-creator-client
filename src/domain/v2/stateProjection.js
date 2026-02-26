import { createEmptyProjectState } from "./model.js";
import { RESOURCE_TYPES } from "./constants.js";

const toFiniteTimestamp = (value, fallback) =>
  Number.isFinite(value) ? value : fallback;

const cloneOr = (value, fallback) => {
  if (value === undefined) return fallback;
  return structuredClone(value);
};

const getHierarchyNodes = (collection) =>
  Array.isArray(collection?.tree) ? collection.tree : [];

const walkHierarchy = (nodes, parentId, callback) => {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    if (!node || typeof node.id !== "string") continue;
    callback(node, parentId);
    walkHierarchy(node.children, node.id, callback);
  }
};

const buildHierarchyParentMap = (tree) => {
  const parentById = new Map();
  const orderedIds = [];
  walkHierarchy(tree, null, (node, parentId) => {
    parentById.set(node.id, parentId);
    orderedIds.push(node.id);
  });
  return { parentById, orderedIds };
};

const appendMissingIds = (orderedIds, allIds) => {
  const result = [];
  const seen = new Set();

  for (const id of orderedIds) {
    if (!allIds.includes(id) || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }

  for (const id of allIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }

  return result;
};

const buildTreeFromParentMap = ({
  orderedIds,
  allIds,
  parentById,
  fallbackParentById,
}) => {
  const ROOT = "__root__";
  const ids = appendMissingIds(orderedIds, allIds);
  const idSet = new Set(ids);
  const childrenByParent = new Map([[ROOT, []]]);

  for (const id of ids) {
    const rawParentId =
      parentById.get(id) ?? fallbackParentById?.get(id) ?? null;
    const parentId =
      typeof rawParentId === "string" &&
      rawParentId.length > 0 &&
      rawParentId !== id &&
      idSet.has(rawParentId)
        ? rawParentId
        : null;
    const key = parentId || ROOT;
    if (!childrenByParent.has(key)) {
      childrenByParent.set(key, []);
    }
    childrenByParent.get(key).push(id);
  }

  const visited = new Set();
  const buildNodes = (parentKey) => {
    const idsForParent = childrenByParent.get(parentKey) || [];
    const nodes = [];
    for (const id of idsForParent) {
      if (visited.has(id)) continue;
      visited.add(id);
      const children = buildNodes(id);
      if (children.length > 0) {
        nodes.push({ id, children });
      } else {
        nodes.push({ id });
      }
    }
    return nodes;
  };

  const tree = buildNodes(ROOT);
  for (const id of ids) {
    if (visited.has(id)) continue;
    visited.add(id);
    tree.push({ id });
  }
  return tree;
};

const projectRepositoryLayouts = ({ repositoryLayoutsCollection = {} }) => {
  const repositoryLayouts = repositoryLayoutsCollection.items || {};
  const { parentById: treeParentById } = buildHierarchyParentMap(
    getHierarchyNodes(repositoryLayoutsCollection),
  );
  const fallbackParentById = new Map(
    Object.entries(repositoryLayouts).map(([layoutId, layout]) => [
      layoutId,
      layout?.parentId ?? null,
    ]),
  );
  const result = {};
  for (const [layoutId, repositoryLayout] of Object.entries(
    repositoryLayouts,
  )) {
    if (!repositoryLayout || typeof repositoryLayout !== "object") continue;
    const clonedLayout = cloneOr(repositoryLayout, {});
    const entryType = clonedLayout.type || "layout";
    const createdAt = toFiniteTimestamp(repositoryLayout.createdAt, Date.now());
    const updatedAt = toFiniteTimestamp(repositoryLayout.updatedAt, createdAt);
    const parentId = treeParentById.has(layoutId)
      ? treeParentById.get(layoutId)
      : (fallbackParentById.get(layoutId) ?? null);

    if (entryType === "folder") {
      result[layoutId] = {
        ...clonedLayout,
        id: layoutId,
        type: "folder",
        name: repositoryLayout.name || `Folder ${layoutId}`,
        parentId,
        createdAt,
        updatedAt,
      };
      continue;
    }

    const repositoryElements = repositoryLayout.elements || {
      items: {},
      tree: [],
    };
    const elementItems = repositoryElements.items || {};
    const { parentById, orderedIds } = buildHierarchyParentMap(
      getHierarchyNodes(repositoryElements),
    );

    const elements = {};
    for (const [elementId, element] of Object.entries(elementItems)) {
      const parentId = parentById.has(elementId)
        ? parentById.get(elementId)
        : (element?.parentId ?? null);
      const children = [];
      elements[elementId] = {
        id: elementId,
        ...cloneOr(element, {}),
        parentId,
        children,
      };
    }

    for (const id of orderedIds) {
      const parentId = parentById.get(id) ?? null;
      if (!parentId) continue;
      if (!elements[parentId] || !elements[id]) continue;
      elements[parentId].children.push(id);
    }

    const rootElementOrder = appendMissingIds(
      orderedIds.filter((id) => (parentById.get(id) ?? null) === null),
      Object.keys(elements).filter((id) => {
        const parentId = elements[id]?.parentId ?? null;
        return !parentId || !elements[parentId];
      }),
    );

    result[layoutId] = {
      ...clonedLayout,
      id: layoutId,
      type: entryType,
      name: repositoryLayout.name || `Layout ${layoutId}`,
      layoutType: repositoryLayout.layoutType || "base",
      parentId,
      elements,
      rootElementOrder,
      createdAt,
      updatedAt,
    };
  }

  return result;
};

const projectRepositoryResources = ({ repositoryState }) => {
  const resources = Object.fromEntries(
    RESOURCE_TYPES.map((type) => [type, { items: {}, tree: [] }]),
  );

  for (const resourceType of RESOURCE_TYPES) {
    const repositoryCollection = repositoryState?.[resourceType] || {};
    const repositoryItems = repositoryCollection.items || {};
    const { parentById, orderedIds } = buildHierarchyParentMap(
      getHierarchyNodes(repositoryCollection),
    );
    const allIds = Object.keys(repositoryItems);
    const fallbackParentById = new Map(
      Object.entries(repositoryItems).map(([resourceId, item]) => [
        resourceId,
        item?.parentId ?? null,
      ]),
    );

    resources[resourceType].tree = buildTreeFromParentMap({
      orderedIds,
      allIds,
      parentById,
      fallbackParentById,
    });

    for (const [resourceId, item] of Object.entries(repositoryItems)) {
      const parentId = parentById.has(resourceId)
        ? parentById.get(resourceId)
        : (item?.parentId ?? null);
      resources[resourceType].items[resourceId] = {
        id: resourceId,
        ...cloneOr(item, {}),
        parentId,
        createdAt: toFiniteTimestamp(item?.createdAt, Date.now()),
        updatedAt: toFiniteTimestamp(
          item?.updatedAt,
          toFiniteTimestamp(item?.createdAt, Date.now()),
        ),
      };
    }
  }

  return resources;
};

const projectRepositoryVariables = ({ repositoryVariables = {} }) => {
  const result = {
    items: {},
    tree: [],
  };
  const items = repositoryVariables.items || {};
  const { parentById, orderedIds } = buildHierarchyParentMap(
    getHierarchyNodes(repositoryVariables),
  );
  const allIds = Object.keys(items);
  const fallbackParentById = new Map(
    Object.entries(items).map(([variableId, variable]) => [
      variableId,
      variable?.parentId ?? null,
    ]),
  );
  result.tree = buildTreeFromParentMap({
    orderedIds,
    allIds,
    parentById,
    fallbackParentById,
  });

  for (const [variableId, variable] of Object.entries(items)) {
    if (!variable || typeof variable !== "object") continue;
    const parentId = parentById.has(variableId)
      ? parentById.get(variableId)
      : (variable?.parentId ?? null);
    const createdAt = toFiniteTimestamp(variable.createdAt, Date.now());
    const updatedAt = toFiniteTimestamp(variable.updatedAt, createdAt);

    if (variable.type === "folder") {
      result.items[variableId] = {
        id: variableId,
        ...cloneOr(variable, {}),
        type: "folder",
        name: variable.name || `Folder ${variableId}`,
        parentId,
        createdAt,
        updatedAt,
      };
      continue;
    }

    const inferredType =
      variable.type ||
      variable.variableType ||
      (typeof variable.default === "number" ||
      typeof variable.value === "number"
        ? "number"
        : typeof variable.default === "boolean" ||
            typeof variable.value === "boolean"
          ? "boolean"
          : "string");
    const inferredDefault =
      variable.default !== undefined
        ? cloneOr(variable.default, "")
        : cloneOr(variable.value, "");

    result.items[variableId] = {
      id: variableId,
      ...cloneOr(variable, {}),
      itemType: "variable",
      type: inferredType,
      default: inferredDefault,
      parentId,
      createdAt,
      updatedAt,
    };
  }

  return result;
};

export const projectRepositoryStateToDomainState = ({
  repositoryState,
  projectId = "unknown-project",
}) => {
  const now = Date.now();
  const state = createEmptyProjectState({
    projectId,
    name: repositoryState?.project?.name || "",
    description: repositoryState?.project?.description || "",
  });

  if (!repositoryState || typeof repositoryState !== "object") {
    return state;
  }

  const sceneItems = repositoryState?.scenes?.items || {};
  const sceneHierarchy = getHierarchyNodes(repositoryState?.scenes);
  const { orderedIds: sceneHierarchyOrder } =
    buildHierarchyParentMap(sceneHierarchy);

  for (const [sceneId, scene] of Object.entries(sceneItems)) {
    if (!scene || scene.type !== "scene") continue;
    const sections = scene.sections || { items: {}, tree: [] };
    const sectionItems = sections.items || {};
    const sectionHierarchy = getHierarchyNodes(sections);
    const { orderedIds: sectionHierarchyOrder } =
      buildHierarchyParentMap(sectionHierarchy);
    const allSectionIds = Object.keys(sectionItems).filter(
      (sectionId) => sectionItems[sectionId]?.type !== "folder",
    );
    const sectionIds = appendMissingIds(
      sectionHierarchyOrder.filter(
        (sectionId) => sectionItems[sectionId]?.type !== "folder",
      ),
      allSectionIds,
    );
    const initialSectionId =
      sectionIds.includes(scene.initialSectionId) && scene.initialSectionId
        ? scene.initialSectionId
        : (sectionIds[0] ?? null);

    state.scenes[sceneId] = {
      id: sceneId,
      name: scene.name || `Scene ${sceneId}`,
      sectionIds,
      initialSectionId,
      position: cloneOr(scene.position, { x: 200, y: 200 }),
      createdAt: toFiniteTimestamp(scene.createdAt, now),
      updatedAt: toFiniteTimestamp(
        scene.updatedAt,
        toFiniteTimestamp(scene.createdAt, now),
      ),
    };

    for (const [sectionId, section] of Object.entries(sectionItems)) {
      if (!section || section.type === "folder") continue;
      const lines = section.lines || { items: {}, tree: [] };
      const lineItems = lines.items || {};
      const lineHierarchy = getHierarchyNodes(lines);
      const { orderedIds: lineHierarchyOrder } =
        buildHierarchyParentMap(lineHierarchy);
      const lineIds = appendMissingIds(
        lineHierarchyOrder,
        Object.keys(lineItems),
      );
      const initialLineId =
        lineIds.includes(section.initialLineId) && section.initialLineId
          ? section.initialLineId
          : (lineIds[0] ?? null);

      state.sections[sectionId] = {
        id: sectionId,
        sceneId,
        name: section.name || `Section ${sectionId}`,
        lineIds,
        initialLineId,
        createdAt: toFiniteTimestamp(section.createdAt, now),
        updatedAt: toFiniteTimestamp(
          section.updatedAt,
          toFiniteTimestamp(section.createdAt, now),
        ),
      };

      for (const [lineId, line] of Object.entries(lineItems)) {
        state.lines[lineId] = {
          id: lineId,
          sectionId,
          actions: cloneOr(line?.actions, {}),
          createdAt: toFiniteTimestamp(line?.createdAt, now),
          updatedAt: toFiniteTimestamp(
            line?.updatedAt,
            toFiniteTimestamp(line?.createdAt, now),
          ),
        };
      }
    }
  }

  const allSceneIds = Object.keys(state.scenes);
  const sceneOrder = appendMissingIds(sceneHierarchyOrder, allSceneIds).filter(
    (sceneId) => !!state.scenes[sceneId],
  );
  state.story.sceneOrder = sceneOrder;

  const initialSceneId = repositoryState?.story?.initialSceneId;
  state.story.initialSceneId =
    (initialSceneId && state.scenes[initialSceneId] && initialSceneId) ||
    sceneOrder[0] ||
    null;

  state.resources = projectRepositoryResources({ repositoryState });
  state.layoutTree = structuredClone(
    getHierarchyNodes(repositoryState?.layouts),
  );
  state.layouts = projectRepositoryLayouts({
    repositoryLayoutsCollection: repositoryState?.layouts || {},
  });
  state.variables = projectRepositoryVariables({
    repositoryVariables: repositoryState?.variables,
  });

  state.project.createdAt = toFiniteTimestamp(
    repositoryState?.project?.createdAt,
    now,
  );
  state.project.updatedAt = toFiniteTimestamp(
    repositoryState?.project?.updatedAt,
    state.project.createdAt,
  );

  return state;
};
