import { createEmptyProjectState } from "../../internal/project/state.js";
import { RESOURCE_TYPES } from "./commands.js";

const DEFAULT_TIMESTAMP = 0;

const toFiniteTimestamp = (value, fallback) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

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
      const createdAt = toFiniteTimestamp(item?.createdAt, DEFAULT_TIMESTAMP);
      const updatedAt = toFiniteTimestamp(item?.updatedAt, createdAt);

      if (resourceType === "layouts") {
        const clonedLayout = cloneOr(item, {});
        const entryType = clonedLayout.type || "layout";

        if (entryType === "folder") {
          resources[resourceType].items[resourceId] = {
            id: resourceId,
            ...clonedLayout,
            type: "folder",
            name: item?.name || `Folder ${resourceId}`,
            parentId,
            createdAt,
            updatedAt,
          };
          continue;
        }

        const repositoryElements = item?.elements || { items: {}, tree: [] };
        const elementItems = repositoryElements.items || {};
        const { parentById: elementParentById, orderedIds: elementOrderedIds } =
          buildHierarchyParentMap(getHierarchyNodes(repositoryElements));

        const elements = {};
        for (const [elementId, element] of Object.entries(elementItems)) {
          const elementParentId = elementParentById.has(elementId)
            ? elementParentById.get(elementId)
            : (element?.parentId ?? null);
          elements[elementId] = {
            id: elementId,
            ...cloneOr(element, {}),
            parentId: elementParentId,
            children: [],
          };
        }

        for (const id of elementOrderedIds) {
          const elementParentId = elementParentById.get(id) ?? null;
          if (!elementParentId) continue;
          if (!elements[elementParentId] || !elements[id]) continue;
          elements[elementParentId].children.push(id);
        }

        const rootElementOrder = appendMissingIds(
          elementOrderedIds.filter(
            (id) => (elementParentById.get(id) ?? null) === null,
          ),
          Object.keys(elements).filter((id) => {
            const elementParentId = elements[id]?.parentId ?? null;
            return !elementParentId || !elements[elementParentId];
          }),
        );

        resources[resourceType].items[resourceId] = {
          id: resourceId,
          ...clonedLayout,
          type: entryType,
          name: item?.name || `Layout ${resourceId}`,
          layoutType: item?.layoutType || "base",
          parentId,
          elements,
          rootElementOrder,
          createdAt,
          updatedAt,
        };
        continue;
      }

      resources[resourceType].items[resourceId] = {
        id: resourceId,
        ...cloneOr(item, {}),
        parentId,
        createdAt,
        updatedAt,
      };
    }
  }

  return resources;
};

export const projectRepositoryStateToDomainState = ({
  repositoryState,
  projectId = "unknown-project",
}) => {
  const state = createEmptyProjectState({
    projectId,
    name: repositoryState?.project?.name || "",
    description: repositoryState?.project?.description || "",
    timestamp: toFiniteTimestamp(
      repositoryState?.project?.createdAt,
      DEFAULT_TIMESTAMP,
    ),
  });

  if (!repositoryState || typeof repositoryState !== "object") {
    return state;
  }

  const sceneItems = repositoryState?.scenes?.items || {};
  const sceneHierarchy = getHierarchyNodes(repositoryState?.scenes);
  const { parentById: sceneParentById, orderedIds: sceneHierarchyOrder } =
    buildHierarchyParentMap(sceneHierarchy);

  for (const [sceneId, scene] of Object.entries(sceneItems)) {
    if (!scene || typeof scene !== "object") continue;
    const sceneType = scene.type === "folder" ? "folder" : "scene";
    const parentId = sceneParentById.has(sceneId)
      ? sceneParentById.get(sceneId)
      : (scene?.parentId ?? null);

    if (sceneType === "folder") {
      state.scenes[sceneId] = {
        id: sceneId,
        type: "folder",
        name: scene.name || `Folder ${sceneId}`,
        sectionIds: [],
        initialSectionId: null,
        parentId,
        position: cloneOr(scene.position, { x: 200, y: 200 }),
        createdAt: toFiniteTimestamp(scene.createdAt, DEFAULT_TIMESTAMP),
        updatedAt: toFiniteTimestamp(
          scene.updatedAt,
          toFiniteTimestamp(scene.createdAt, DEFAULT_TIMESTAMP),
        ),
      };
      continue;
    }

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
      type: "scene",
      name: scene.name || `Scene ${sceneId}`,
      sectionIds,
      initialSectionId,
      parentId,
      position: cloneOr(scene.position, { x: 200, y: 200 }),
      createdAt: toFiniteTimestamp(scene.createdAt, DEFAULT_TIMESTAMP),
      updatedAt: toFiniteTimestamp(
        scene.updatedAt,
        toFiniteTimestamp(scene.createdAt, DEFAULT_TIMESTAMP),
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
        createdAt: toFiniteTimestamp(section.createdAt, DEFAULT_TIMESTAMP),
        updatedAt: toFiniteTimestamp(
          section.updatedAt,
          toFiniteTimestamp(section.createdAt, DEFAULT_TIMESTAMP),
        ),
      };

      for (const [lineId, line] of Object.entries(lineItems)) {
        state.lines[lineId] = {
          id: lineId,
          sectionId,
          actions: cloneOr(line?.actions, {}),
          createdAt: toFiniteTimestamp(line?.createdAt, DEFAULT_TIMESTAMP),
          updatedAt: toFiniteTimestamp(
            line?.updatedAt,
            toFiniteTimestamp(line?.createdAt, DEFAULT_TIMESTAMP),
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
  const firstPlayableSceneId = sceneOrder.find(
    (sceneId) => state.scenes[sceneId]?.type !== "folder",
  );
  state.story.initialSceneId =
    (initialSceneId &&
      state.scenes[initialSceneId]?.type !== "folder" &&
      initialSceneId) ||
    firstPlayableSceneId ||
    null;

  state.resources = projectRepositoryResources({ repositoryState });
  state.project.createdAt = toFiniteTimestamp(
    repositoryState?.project?.createdAt,
    DEFAULT_TIMESTAMP,
  );
  state.project.updatedAt = toFiniteTimestamp(
    repositoryState?.project?.updatedAt,
    state.project.createdAt,
  );

  return state;
};
