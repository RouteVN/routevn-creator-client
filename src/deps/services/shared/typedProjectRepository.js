import { processCommand } from "../../../domain/v2/engine.js";
import { projectRepositoryStateToDomainState } from "../../../domain/v2/stateProjection.js";
import { createProjectRepositoryRuntime } from "./projectRepositoryRuntime.js";

export const createTreeCollection = () => {
  return {
    items: {},
    tree: [],
  };
};

export const initialProjectData = {
  model_version: 2,
  project: {
    name: "",
    description: "",
  },
  story: {
    initialSceneId: "",
  },
  images: createTreeCollection(),
  tweens: createTreeCollection(),
  sounds: createTreeCollection(),
  videos: createTreeCollection(),
  characters: createTreeCollection(),
  fonts: createTreeCollection(),
  transforms: createTreeCollection(),
  colors: createTreeCollection(),
  typography: createTreeCollection(),
  variables: createTreeCollection(),
  components: createTreeCollection(),
  layouts: createTreeCollection(),
  scenes: createTreeCollection(),
};

export const assertV2State = (state) => {
  if (!state || state.model_version !== 2) {
    throw new Error(
      "Unsupported project model version. RouteVN V2 only supports model_version=2 projects.",
    );
  }
};

export const getHierarchyNodes = (collection) =>
  Array.isArray(collection?.tree) ? collection.tree : [];

export const normalizeParentId = (parentId) => {
  if (typeof parentId !== "string" || parentId.length === 0) return null;
  return parentId === "_root" ? null : parentId;
};

const findOrderNodeById = (nodes = [], id) => {
  for (const node of nodes) {
    if (!node || typeof node.id !== "string") continue;
    if (node.id === id) return node;
    const found = findOrderNodeById(node.children || [], id);
    if (found) return found;
  }
  return null;
};

export const getSiblingOrderNodes = (collection, parentId) => {
  const normalizedParentId = normalizeParentId(parentId);
  if (!normalizedParentId) {
    return getHierarchyNodes(collection);
  }
  const parentNode = findOrderNodeById(
    getHierarchyNodes(collection),
    normalizedParentId,
  );
  return Array.isArray(parentNode?.children) ? parentNode.children : [];
};

export const resolveIndexFromPosition = ({
  siblings = [],
  position,
  movingId = null,
}) => {
  const filtered = Array.isArray(siblings)
    ? siblings.filter((node) => node?.id && node.id !== movingId)
    : [];

  if (position === "first") return 0;
  if (position === "last" || position === undefined || position === null) {
    return filtered.length;
  }

  if (position && typeof position === "object") {
    if (typeof position.before === "string") {
      const beforeIndex = filtered.findIndex(
        (node) => node.id === position.before,
      );
      return beforeIndex >= 0 ? beforeIndex : filtered.length;
    }
    if (typeof position.after === "string") {
      const afterIndex = filtered.findIndex(
        (node) => node.id === position.after,
      );
      return afterIndex >= 0 ? afterIndex + 1 : filtered.length;
    }
  }

  return filtered.length;
};

export const uniquePartitions = (...partitions) => {
  const seen = new Set();
  const output = [];
  for (const partition of partitions) {
    if (typeof partition !== "string" || partition.length === 0) continue;
    if (seen.has(partition)) continue;
    seen.add(partition);
    output.push(partition);
  }
  return output;
};

export const findSectionLocation = (state, sectionId) => {
  const sceneItems = state?.scenes?.items || {};
  for (const [sceneId, scene] of Object.entries(sceneItems)) {
    const sections = scene?.sections || createTreeCollection();
    const section = sections.items?.[sectionId];
    if (!section) continue;
    return {
      sceneId,
      scene,
      section,
      sectionCollection: sections,
    };
  }
  return null;
};

export const findLineLocation = (state, lineId) => {
  const sceneItems = state?.scenes?.items || {};
  for (const [sceneId, scene] of Object.entries(sceneItems)) {
    const sections = scene?.sections?.items || {};
    for (const [sectionId, section] of Object.entries(sections)) {
      const line = section?.lines?.items?.[lineId];
      if (!line) continue;
      return {
        sceneId,
        sectionId,
        line,
      };
    }
  }
  return null;
};

const hasCommandTypePrefix = (commandType, prefix) =>
  typeof commandType === "string" && commandType.startsWith(prefix);

export const isDirectDomainProjectionCommand = (command) =>
  command?.type === "project.update" ||
  hasCommandTypePrefix(command?.type, "resource.") ||
  hasCommandTypePrefix(command?.type, "scene.") ||
  hasCommandTypePrefix(command?.type, "section.") ||
  hasCommandTypePrefix(command?.type, "line.") ||
  hasCommandTypePrefix(command?.type, "layout.") ||
  hasCommandTypePrefix(command?.type, "variable.");

const flattenTreeIds = (nodes, output = []) => {
  if (!Array.isArray(nodes)) return output;
  for (const node of nodes) {
    if (!node || typeof node.id !== "string") continue;
    output.push(node.id);
    flattenTreeIds(node.children || [], output);
  }
  return output;
};

const uniqueIdsInOrder = (orderIds, existingIds) => {
  const existingSet = new Set(existingIds);
  const seen = new Set();
  const output = [];

  for (const id of Array.isArray(orderIds) ? orderIds : []) {
    if (typeof id !== "string" || id.length === 0) continue;
    if (!existingSet.has(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    output.push(id);
  }

  for (const id of existingIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    output.push(id);
  }

  return output;
};

const buildHierarchyOrderFromFlatCollection = (collection) => {
  const items = collection?.items || {};
  const ids = Object.keys(items);
  const orderedIds = uniqueIdsInOrder(flattenTreeIds(collection?.tree), ids);
  const idSet = new Set(ids);
  const ROOT = "__root__";
  const childrenByParent = new Map();
  childrenByParent.set(ROOT, []);

  for (const id of orderedIds) {
    const item = items[id];
    const rawParentId = item?.parentId;
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
        nodes.push({
          id,
          children,
        });
      } else {
        nodes.push({ id });
      }
    }
    return nodes;
  };

  const rootNodes = buildNodes(ROOT);
  for (const id of orderedIds) {
    if (visited.has(id)) continue;
    visited.add(id);
    rootNodes.push({ id });
  }
  return rootNodes;
};

const projectDomainResourceCollectionToRepository = (domainCollection) => {
  const items = domainCollection?.items || {};
  const projectedItems = {};
  for (const [resourceId, resource] of Object.entries(items)) {
    projectedItems[resourceId] = {
      id: resourceId,
      ...structuredClone(resource || {}),
    };
  }

  const tree = buildHierarchyOrderFromFlatCollection({
    items,
    tree: domainCollection?.tree || [],
  });
  return {
    items: projectedItems,
    tree,
  };
};

const projectDomainLayoutElementsToRepository = ({
  layout,
  existingRepositoryElements = {},
}) => {
  const existingItems = existingRepositoryElements?.items || {};
  const projectedItems = {};

  for (const [elementId, element] of Object.entries(layout?.elements || {})) {
    const existingElement = existingItems?.[elementId] || {};
    const elementClone = structuredClone(element || {});
    delete elementClone.children;
    delete elementClone.parentId;
    projectedItems[elementId] = {
      ...structuredClone(existingElement),
      ...elementClone,
      id: elementId,
    };
  }

  const visited = new Set();
  const makeNode = (elementId) => {
    if (visited.has(elementId)) return null;
    const element = layout?.elements?.[elementId];
    if (!element) return null;
    visited.add(elementId);

    const children = [];
    for (const childId of element.children || []) {
      if (layout?.elements?.[childId]?.parentId !== elementId) continue;
      const childNode = makeNode(childId);
      if (childNode) children.push(childNode);
    }

    if (children.length > 0) {
      return {
        id: elementId,
        children,
      };
    }

    return { id: elementId };
  };

  const order = [];
  for (const rootId of layout?.rootElementOrder || []) {
    const node = makeNode(rootId);
    if (node) order.push(node);
  }

  for (const elementId of Object.keys(layout?.elements || {})) {
    if (visited.has(elementId)) continue;
    const node = makeNode(elementId);
    if (node) order.push(node);
  }

  return {
    items: projectedItems,
    tree: order,
  };
};

const projectDomainLayoutsToRepository = ({ domainState, repositoryState }) => {
  const repositoryLayouts = repositoryState?.layouts || createTreeCollection();
  const domainLayoutTree = Array.isArray(domainState?.layoutTree)
    ? domainState.layoutTree
    : getHierarchyNodes(repositoryLayouts);
  const repositoryOrderIds = flattenTreeIds(domainLayoutTree);
  const layoutIds = Object.keys(domainState?.layouts || {});
  const orderedLayoutIds = uniqueIdsInOrder(repositoryOrderIds, layoutIds);
  const projectedItems = {};

  for (const layoutId of orderedLayoutIds) {
    const layout = domainState?.layouts?.[layoutId];
    if (!layout) continue;
    const existingLayout = repositoryLayouts?.items?.[layoutId] || {};
    const layoutClone = structuredClone(layout || {});
    const entryType = layoutClone.type || existingLayout.type || "layout";
    delete layoutClone.elements;
    delete layoutClone.rootElementOrder;

    const projectedLayout = {
      ...structuredClone(existingLayout),
      ...layoutClone,
      id: layoutId,
      type: entryType,
    };

    if (entryType === "folder") {
      delete projectedLayout.layoutType;
      delete projectedLayout.elements;
      delete projectedLayout.rootElementOrder;
    } else {
      projectedLayout.elements = projectDomainLayoutElementsToRepository({
        layout,
        existingRepositoryElements: existingLayout?.elements,
      });
    }

    projectedItems[layoutId] = projectedLayout;
  }

  const tree = buildHierarchyOrderFromFlatCollection({
    items: projectedItems,
    tree: domainLayoutTree,
  });
  return {
    items: projectedItems,
    tree,
  };
};

const projectDomainVariablesToRepository = ({ domainState }) => {
  const domainVariables = domainState?.variables || { items: {}, tree: [] };
  const items = domainVariables.items || {};
  const projectedItems = {};

  for (const [variableId, variable] of Object.entries(items)) {
    const clone = structuredClone(variable || {});
    delete clone.parentId;

    if (clone.type === "folder") {
      projectedItems[variableId] = {
        ...clone,
        id: variableId,
        type: "folder",
      };
      continue;
    }

    const valueType =
      typeof clone.type === "string" && clone.type.length > 0
        ? clone.type
        : clone.variableType || "string";
    const defaultValue = Object.prototype.hasOwnProperty.call(clone, "default")
      ? structuredClone(clone.default)
      : structuredClone(clone.value ?? "");

    projectedItems[variableId] = {
      ...clone,
      id: variableId,
      itemType: "variable",
      type: valueType,
      variableType: valueType,
      default: defaultValue,
      value: structuredClone(defaultValue),
    };
  }

  const tree = buildHierarchyOrderFromFlatCollection({
    items,
    tree: domainVariables.tree || [],
  });
  return {
    items: projectedItems,
    tree,
  };
};

const buildTreeNodesFromOrderedIds = (orderedIds) =>
  orderedIds.map((id) => ({
    id,
  }));

const resolveStorySceneOrder = (domainState) => {
  const sceneIds = Object.keys(domainState?.scenes || {});
  return uniqueIdsInOrder(domainState?.story?.sceneOrder || [], sceneIds);
};

const resolveSceneSectionOrder = (domainState, sceneId) => {
  const scene = domainState?.scenes?.[sceneId] || {};
  const sectionIds = Object.keys(domainState?.sections || {}).filter(
    (id) => domainState.sections[id]?.sceneId === sceneId,
  );
  return uniqueIdsInOrder(scene.sectionIds || [], sectionIds);
};

const resolveSectionLineOrder = (domainState, sectionId) => {
  const section = domainState?.sections?.[sectionId] || {};
  const lineIds = Object.keys(domainState?.lines || {}).filter(
    (id) => domainState.lines[id]?.sectionId === sectionId,
  );
  return uniqueIdsInOrder(section.lineIds || [], lineIds);
};

const projectDomainStoryToRepository = ({ domainState, repositoryState }) => {
  const repositoryScenesItems = repositoryState?.scenes?.items || {};
  const sceneOrder = resolveStorySceneOrder(domainState);
  const scenesItems = {};

  for (const sceneId of sceneOrder) {
    const scene = domainState?.scenes?.[sceneId];
    if (!scene) continue;
    const existingScene = repositoryScenesItems?.[sceneId] || {};
    const existingSections = existingScene?.sections || {};
    const existingSectionItems = existingSections?.items || {};
    const sectionOrder = resolveSceneSectionOrder(domainState, sceneId);
    const sectionItems = {};

    for (const sectionId of sectionOrder) {
      const section = domainState?.sections?.[sectionId];
      if (!section) continue;
      const existingSection = existingSectionItems?.[sectionId] || {};
      const existingLines = existingSection?.lines || {};
      const existingLineItems = existingLines?.items || {};
      const lineOrder = resolveSectionLineOrder(domainState, sectionId);
      const lineItems = {};

      for (const lineId of lineOrder) {
        const line = domainState?.lines?.[lineId];
        if (!line) continue;
        const existingLine = existingLineItems?.[lineId] || {};
        lineItems[lineId] = {
          ...structuredClone(existingLine),
          ...structuredClone(line),
          id: lineId,
        };
      }

      sectionItems[sectionId] = {
        ...structuredClone(existingSection),
        ...structuredClone(section),
        id: sectionId,
        type: "section",
        lines: {
          items: lineItems,
          tree: buildTreeNodesFromOrderedIds(lineOrder),
        },
      };
    }

    scenesItems[sceneId] = {
      ...structuredClone(existingScene),
      ...structuredClone(scene),
      id: sceneId,
      type: "scene",
      sections: {
        items: sectionItems,
        tree: buildTreeNodesFromOrderedIds(sectionOrder),
      },
    };
  }

  return {
    story: {
      ...repositoryState?.story,
      initialSceneId: domainState?.story?.initialSceneId || null,
    },
    scenes: {
      items: scenesItems,
      tree: buildTreeNodesFromOrderedIds(sceneOrder),
    },
  };
};

const projectDomainStateToRepositoryState = ({
  domainState,
  repositoryState,
}) => {
  const nextState = structuredClone(repositoryState || {});
  nextState.model_version = 2;
  nextState.project = {
    ...repositoryState?.project,
    ...structuredClone(domainState?.project || {}),
  };

  for (const [resourceType, domainCollection] of Object.entries(
    domainState?.resources || {},
  )) {
    nextState[resourceType] =
      projectDomainResourceCollectionToRepository(domainCollection);
  }

  const projectedStory = projectDomainStoryToRepository({
    domainState,
    repositoryState,
  });
  nextState.story = projectedStory.story;
  nextState.scenes = projectedStory.scenes;

  nextState.layouts = projectDomainLayoutsToRepository({
    domainState,
    repositoryState,
  });
  nextState.variables = projectDomainVariablesToRepository({
    domainState,
  });

  return nextState;
};

const applyTypedEventToRepositoryState = ({
  repositoryState,
  event,
  projectId,
}) => {
  if (event?.type === "typedSnapshot") {
    const snapshotState = event?.payload?.state;
    if (!snapshotState || typeof snapshotState !== "object") {
      throw new Error("typedSnapshot event payload.state is required");
    }
    return projectDomainStateToRepositoryState({
      domainState: snapshotState,
      repositoryState,
    });
  }

  if (event?.type === "typedCommand") {
    const command = event?.payload?.command;
    if (!isDirectDomainProjectionCommand(command)) {
      throw new Error(
        `No typed projection handler for command type '${command?.type || "unknown"}'`,
      );
    }

    const resolvedProjectId =
      event?.payload?.projectId ||
      projectId ||
      repositoryState?.project?.id ||
      "unknown-project";
    const domainStateBefore = projectRepositoryStateToDomainState({
      repositoryState,
      projectId: resolvedProjectId,
    });
    const { state: domainStateAfter } = processCommand({
      state: domainStateBefore,
      command,
    });
    return projectDomainStateToRepositoryState({
      domainState: domainStateAfter,
      repositoryState,
    });
  }

  return undefined;
};

const createInitialRepositoryStateForProject = (projectId) => ({
  ...structuredClone(initialProjectData),
  project: {
    ...structuredClone(initialProjectData.project || {}),
    id: projectId,
  },
});

export const createInsiemeProjectRepositoryRuntime = async ({
  projectId,
  store,
  events: sourceEvents = [],
}) =>
  createProjectRepositoryRuntime({
    projectId,
    store,
    events: sourceEvents,
    createInitialState: () => createInitialRepositoryStateForProject(projectId),
    reduceEventToState: ({ repositoryState, event }) =>
      applyTypedEventToRepositoryState({
        repositoryState,
        event,
        projectId,
      }),
    assertState: assertV2State,
  });

export const applyTypedCommandToRepository = async ({
  repository,
  command,
  projectId,
}) => {
  if (!isDirectDomainProjectionCommand(command)) {
    throw new Error(
      `No typed projection handler for command type '${command?.type || "unknown"}'`,
    );
  }

  await repository.addEvent({
    type: "typedCommand",
    payload: {
      projectId,
      command: structuredClone(command),
    },
  });

  return {
    mode: "typed_command_event",
    events: [
      {
        type: command.type,
        payload: structuredClone(command.payload || {}),
      },
    ],
  };
};

export const applyTypedSnapshotToRepository = async ({
  repository,
  state,
  projectId,
}) => {
  if (!state || typeof state !== "object") {
    throw new Error("Snapshot state is required");
  }

  await repository.addEvent({
    type: "typedSnapshot",
    payload: {
      projectId,
      state: structuredClone(state),
    },
  });

  return {
    mode: "typed_snapshot_event",
    events: [
      {
        type: "typedSnapshot",
        payload: {
          projectId,
        },
      },
    ],
  };
};
