import { nanoid } from "nanoid";
import JSZip from "jszip";
import { createRepository } from "#domain-structure";
import {
  createInsiemeWebStoreAdapter,
  initializeProject as initializeWebProject,
} from "../../infra/web/webRepositoryAdapter.js";
import { createBundle } from "../../../utils/bundleUtils.js";
import {
  createCommandEnvelope,
  createProjectCollabService,
  createWebSocketTransport,
} from "../../../collab/v2/index.js";
import {
  getImageDimensions,
  getVideoDimensions,
  extractWaveformData,
  extractVideoThumbnail,
  detectFileType,
} from "../../../utils/fileProcessors.js";
import { RESOURCE_TYPES } from "../../../domain/v2/constants.js";
import { processCommand } from "../../../domain/v2/engine.js";
import { projectRepositoryStateToDomainState } from "../../../domain/v2/stateProjection.js";
import { createPersistedInMemoryClientStore } from "./collabClientStore.js";
import {
  loadCommittedCursor,
  saveCommittedCursor,
} from "./collabCommittedCursorStore.js";

// Font loading helper
const loadFont = async (fontName, fontUrl) => {
  const existingFont = Array.from(document.fonts).find(
    (font) => font.family === fontName,
  );
  if (existingFont) {
    return existingFont;
  }

  const fontFace = new FontFace(fontName, `url(${fontUrl})`);
  await fontFace.load();
  document.fonts.add(fontFace);
  return fontFace;
};

const createTreeCollection = () => {
  return {
    items: {},
    tree: [],
  };
};

const getHierarchyNodes = (collection) =>
  Array.isArray(collection?.tree) ? collection.tree : [];

/**
 * Default empty project data structure
 */
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

const assertV2State = (state) => {
  if (!state || state.model_version !== 2) {
    throw new Error(
      "Unsupported project model version. RouteVN V2 only supports model_version=2 projects.",
    );
  }
};

/**
 * Create a project service for the web that manages repositories and operations.
 * Gets current projectId from router query params automatically.
 *
 * @param {Object} params
 * @param {Object} params.router - Router instance to get current projectId from URL
 * @param {Object} params.filePicker - Web file picker instance
 */
const countImageEntries = (imagesData) =>
  Object.values(imagesData?.items || {}).filter(
    (item) => item?.type === "image",
  ).length;

const normalizeParentId = (parentId) => {
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

const getSiblingOrderNodes = (collection, parentId) => {
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

const resolveIndexFromPosition = ({
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

const uniquePartitions = (...partitions) => {
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

const findSectionLocation = (state, sectionId) => {
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

const findLineLocation = (state, lineId) => {
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

const isDirectDomainProjectionCommand = (command) =>
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
  const repositoryOrderIds = flattenTreeIds(getHierarchyNodes(repositoryLayouts));
  const layoutIds = Object.keys(domainState?.layouts || {});
  const orderedLayoutIds = uniqueIdsInOrder(repositoryOrderIds, layoutIds);
  const projectedItems = {};

  for (const layoutId of orderedLayoutIds) {
    const layout = domainState?.layouts?.[layoutId];
    if (!layout) continue;
    const existingLayout = repositoryLayouts?.items?.[layoutId] || {};
    const layoutClone = structuredClone(layout || {});
    delete layoutClone.elements;
    delete layoutClone.rootElementOrder;

    projectedItems[layoutId] = {
      ...structuredClone(existingLayout),
      ...layoutClone,
      id: layoutId,
      type: "layout",
      elements: projectDomainLayoutElementsToRepository({
        layout,
        existingRepositoryElements: existingLayout?.elements,
      }),
    };
  }

  const tree = buildHierarchyOrderFromFlatCollection({
    items: projectedItems,
    tree: getHierarchyNodes(repositoryLayouts),
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

const projectDomainStateToRepositoryState = ({ domainState, repositoryState }) => {
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

const applyTypedEventToRepositoryState = ({ repositoryState, event, projectId }) => {
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

const applyTypedCommandToRepository = async ({
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

export const createProjectService = ({ router, filePicker, onRemoteEvent }) => {
  const collabLog = (level, message, meta = {}) => {
    const fn =
      level === "error"
        ? console.error.bind(console)
        : level === "warn"
          ? console.warn.bind(console)
          : console.log.bind(console);
    fn(`[routevn.collab.web] ${message}`, meta);
  };

  // Repository cache
  const repositoriesByProject = new Map();
  const adaptersByProject = new Map();
  const collabSessionsByProject = new Map();
  const collabSessionModeByProject = new Map();
  const localCollabActorsByProject = new Map();
  const collabDiagnosticsByProject = new Map();
  const collabApplyQueueByProject = new Map();
  const collabLastCommittedIdByProject = new Map();
  const collabAppliedCommittedIdsByProject = new Map();

  // Initialization locks - prevents duplicate initialization
  const initLocksByProject = new Map(); // projectId -> Promise<Repository>

  // Current repository cache (for sync access after ensureRepository is called)
  let currentRepository = null;
  let currentProjectId = null;
  let currentAdapter = null;

  // Get current projectId from URL query params
  const getCurrentProjectId = () => {
    const { p } = router.getPayload();
    return p;
  };

  const storyBasePartitionFor = (projectId) => `project:${projectId}:story`;
  const storyScenePartitionFor = (projectId, sceneId) =>
    `project:${projectId}:story:scene:${sceneId}`;
  const resourceTypePartitionFor = (projectId, resourceType) =>
    `project:${projectId}:resources:${resourceType}`;

  const getBasePartitions = (projectId, partitions) =>
    partitions || [
      storyBasePartitionFor(projectId),
      ...RESOURCE_TYPES.map((resourceType) =>
        resourceTypePartitionFor(projectId, resourceType),
      ),
      `project:${projectId}:layouts`,
      `project:${projectId}:settings`,
    ];

  const getOrCreateLocalActor = (projectId) => {
    const existing = localCollabActorsByProject.get(projectId);
    if (existing) return existing;
    const actor = {
      userId: `local-${projectId}`,
      clientId: `local-${nanoid()}`,
    };
    localCollabActorsByProject.set(projectId, actor);
    return actor;
  };

  const updateCollabDiagnostics = (projectId, patch = {}) => {
    const existing = collabDiagnosticsByProject.get(projectId) || {};
    collabDiagnosticsByProject.set(projectId, {
      ...existing,
      projectId,
      lastUpdatedAt: Date.now(),
      ...patch,
    });
  };

  const ensureCommittedIdLoaded = async (projectId) => {
    if (collabLastCommittedIdByProject.has(projectId)) {
      return collabLastCommittedIdByProject.get(projectId);
    }
    const adapter = adaptersByProject.get(projectId) || null;
    if (!adapter) {
      collabLastCommittedIdByProject.set(projectId, 0);
      return 0;
    }

    let loaded = 0;
    try {
      loaded = await loadCommittedCursor({ adapter, projectId });
    } catch (error) {
      collabLog("warn", "failed to load committed cursor", {
        projectId,
        error: error?.message || "unknown",
      });
    }

    collabLastCommittedIdByProject.set(projectId, loaded);
    return loaded;
  };

  const persistCommittedCursor = async (projectId, cursor) => {
    const normalized = Number.isFinite(Number(cursor))
      ? Math.max(0, Math.floor(Number(cursor)))
      : 0;
    const current = await ensureCommittedIdLoaded(projectId);
    if (normalized <= current) return current;

    collabLastCommittedIdByProject.set(projectId, normalized);
    const adapter = adaptersByProject.get(projectId) || null;
    if (!adapter) return normalized;

    try {
      await saveCommittedCursor({
        adapter,
        projectId,
        cursor: normalized,
      });
    } catch (error) {
      collabLog("warn", "failed to persist committed cursor", {
        projectId,
        cursor: normalized,
        error: error?.message || "unknown",
      });
    }

    return normalized;
  };
  const getAppliedCommittedSet = (projectId) => {
    let committedIds = collabAppliedCommittedIdsByProject.get(projectId);
    if (!committedIds) {
      committedIds = new Set();
      collabAppliedCommittedIdsByProject.set(projectId, committedIds);
    }
    return committedIds;
  };

  const queueCollabApply = (projectId, task) => {
    const previous =
      collabApplyQueueByProject.get(projectId) || Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(task)
      .catch((error) => {
        collabLog("error", "remote apply failed", {
          projectId,
          error: error?.message || "unknown",
        });
      });
    collabApplyQueueByProject.set(projectId, next);
    return next;
  };

  const createSessionForProject = async ({
    projectId,
    token,
    userId,
    clientId,
    endpointUrl,
    partitions,
    mode,
  }) => {
    collabLog("info", "create session requested", {
      projectId,
      endpointUrl: endpointUrl || null,
      mode,
      hasToken: Boolean(token),
      userId,
      clientId,
    });

    const repository = await getRepositoryByProject(projectId);
    const state = repository.getState();
    assertV2State(state);
    const adapter = adaptersByProject.get(projectId);
    if (!adapter) {
      throw new Error(`Store adapter not found for project '${projectId}'`);
    }

    const resolvedProjectId = state.project?.id || projectId;
    const resolvedPartitions = getBasePartitions(resolvedProjectId, partitions);
    const clientStore = await createPersistedInMemoryClientStore({
      projectId,
      adapter,
      logger: (entry) => {
        if (entry?.level === "warn") {
          collabLog("warn", "client store warning", entry);
        }
      },
    });
    await ensureCommittedIdLoaded(projectId);
    updateCollabDiagnostics(projectId, {
      mode,
      endpointUrl: endpointUrl || null,
      actor: {
        userId,
        clientId,
      },
      partitions: resolvedPartitions,
      status: "starting",
    });
    const actor = {
      userId,
      clientId,
    };
    const collabSession = createProjectCollabService({
      projectId: resolvedProjectId,
      projectName: state.project?.name || "",
      projectDescription: state.project?.description || "",
      initialState: projectRepositoryStateToDomainState({
        repositoryState: state,
        projectId: resolvedProjectId,
      }),
      token,
      actor,
      partitions: resolvedPartitions,
      clientStore,
      logger: (entry) => {
        const diagnosticPatch = {
          lastSyncEntry: entry,
          lastSyncEventAt: Date.now(),
        };
        if (entry?.event === "synced") {
          const cursor = Number(entry?.cursor);
          if (Number.isFinite(cursor)) {
            diagnosticPatch.lastSyncedCursor = cursor;
          }
        }
        if (entry?.event === "sync_page_applied") {
          const eventCount = Number(entry?.event_count);
          if (Number.isFinite(eventCount)) {
            diagnosticPatch.lastSyncPageEventCount = eventCount;
          }
        }
        updateCollabDiagnostics(projectId, diagnosticPatch);
        collabLog("debug", "sync-client", entry);
      },
      onCommittedCommand: ({
        command,
        committedEvent,
        sourceType,
        isFromCurrentActor,
      }) =>
        queueCollabApply(projectId, async () => {
          const applyCommittedCommandToRepository = async ({
            command,
            committedEvent,
            sourceType,
            isFromCurrentActor,
          }) => {
            if (isFromCurrentActor) {
              collabLog(
                "debug",
                "typed command skipped (current actor source)",
                {
                  projectId,
                  sourceType,
                  commandId: command?.id || null,
                  commandType: command?.type || null,
                  committedId: Number.isFinite(
                    Number(committedEvent?.committed_id),
                  )
                    ? Number(committedEvent.committed_id)
                    : null,
                },
              );
              return;
            }

            const beforeState = repository.getState();
            const beforeImagesCount = countImageEntries(beforeState?.images);
            const applyResult = await applyTypedCommandToRepository({
              repository,
              command,
              projectId: resolvedProjectId,
            });
            if (applyResult.events.length === 0) {
              collabLog(
                "warn",
                "typed command ignored (no projection events)",
                {
                  projectId,
                  sourceType,
                  commandType: command?.type || null,
                  commandId: command?.id || null,
                },
              );
              return;
            }

            const afterState = repository.getState();
            const afterImagesCount = countImageEntries(afterState?.images);
            collabLog("info", "remote typed command applied to repository", {
              projectId,
              commandType: command?.type || null,
              applyMode: applyResult.mode,
              eventCount: applyResult.events.length,
              beforeImagesCount,
              afterImagesCount,
              sourceType,
            });
            updateCollabDiagnostics(projectId, {
              status: "remote_typed_command_applied",
              sourceType,
              lastRemoteCommandType: command?.type || null,
            });
            if (typeof onRemoteEvent === "function") {
              for (const event of applyResult.events) {
                onRemoteEvent({
                  projectId,
                  sourceType,
                  command,
                  committedEvent,
                  event,
                });
              }
            }
          };

          const committedId = Number(committedEvent?.committed_id);
          const hasCommittedId = Number.isFinite(committedId);
          const lastCommittedId = await ensureCommittedIdLoaded(projectId);

          if (hasCommittedId) {
            const appliedCommittedIds = getAppliedCommittedSet(projectId);
            if (appliedCommittedIds.has(committedId)) {
              collabLog("debug", "committed event skipped (already applied)", {
                projectId,
                committedId,
                sourceType,
              });
              updateCollabDiagnostics(projectId, {
                status: "committed_event_skipped",
                lastSeenCommittedId: committedId,
                lastAppliedCommittedId: lastCommittedId,
                sourceType,
              });
              return;
            }
            appliedCommittedIds.add(committedId);
            if (appliedCommittedIds.size > 5000) {
              const oldest = appliedCommittedIds.values().next().value;
              appliedCommittedIds.delete(oldest);
            }
          }

          await applyCommittedCommandToRepository({
            command,
            committedEvent,
            sourceType,
            isFromCurrentActor,
          });

          if (hasCommittedId) {
            const nextWatermark = Math.max(lastCommittedId, committedId);
            await persistCommittedCursor(projectId, nextWatermark);
            updateCollabDiagnostics(projectId, {
              status: "committed_event_applied",
              lastSeenCommittedId: committedId,
              lastAppliedCommittedId: nextWatermark,
            });
          }
        }),
    });

    await collabSession.start();
    updateCollabDiagnostics(projectId, {
      status: "started",
    });
    collabLog("info", "session started", {
      projectId: resolvedProjectId,
      mode,
      partitions: resolvedPartitions,
      online: Boolean(endpointUrl),
    });
    if (endpointUrl) {
      collabLog("info", "attaching websocket transport", {
        endpointUrl,
      });
      const transport = createWebSocketTransport({
        url: endpointUrl,
        label: "routevn.collab.web.transport",
      });
      await collabSession.setOnlineTransport(transport);
      updateCollabDiagnostics(projectId, {
        endpointUrl,
        status: "online_transport_attached",
      });
      collabLog("info", "websocket transport attached", {
        endpointUrl,
      });
    }

    collabSessionsByProject.set(projectId, collabSession);
    collabSessionModeByProject.set(projectId, mode);
    return collabSession;
  };

  const ensureCommandSessionForProject = async (projectId) => {
    const existing = collabSessionsByProject.get(projectId);
    if (existing) return existing;

    collabLog(
      "warn",
      "creating local-only session (backend transport not attached)",
      {
        projectId,
        hint: "Set collabEndpoint or use default ws://localhost:8787/sync auto-connect.",
      },
    );
    updateCollabDiagnostics(projectId, {
      mode: "local",
      endpointUrl: null,
      status: "local_only",
    });

    const actor = getOrCreateLocalActor(projectId);
    return createSessionForProject({
      projectId,
      token: `user:${actor.userId}:client:${actor.clientId}`,
      userId: actor.userId,
      clientId: actor.clientId,
      mode: "local",
    });
  };

  // Get or create repository by projectId
  const getRepositoryByProject = async (projectId) => {
    // Check cache first
    if (repositoriesByProject.has(projectId)) {
      return repositoriesByProject.get(projectId);
    }

    // Check if initialization is already in progress
    if (initLocksByProject.has(projectId)) {
      return initLocksByProject.get(projectId);
    }

    // Create init promise and store lock
    const initPromise = (async () => {
      try {
        const store = await createInsiemeWebStoreAdapter(projectId);
        const existingEvents = (await store.getEvents()) || [];
        if (existingEvents.length === 0) {
          const bootstrapDomainState = projectRepositoryStateToDomainState({
            repositoryState: {
              ...initialProjectData,
              project: {
                ...initialProjectData.project,
                id: projectId,
              },
            },
            projectId,
          });
          await store.appendEvent({
            type: "typedSnapshot",
            payload: {
              projectId,
              state: bootstrapDomainState,
            },
          });
        }
        const repository = createRepository({
          originStore: store,
          snapshotInterval: 500, // Auto-save snapshot every 500 events
          customEventReducer: (state, event) =>
            applyTypedEventToRepositoryState({
              repositoryState: state,
              event,
              projectId,
            }),
        });
        await repository.init();
        assertV2State(repository.getState());
        repositoriesByProject.set(projectId, repository);
        adaptersByProject.set(projectId, store);
        return repository;
      } finally {
        // Always remove the lock when done (success or failure)
        initLocksByProject.delete(projectId);
      }
    })();

    initLocksByProject.set(projectId, initPromise);
    return initPromise;
  };

  // Get current project's repository (updates cache)
  const getCurrentRepository = async () => {
    const projectId = getCurrentProjectId();
    if (!projectId) {
      throw new Error("No project selected (missing ?p= in URL)");
    }
    const repository = await getRepositoryByProject(projectId);
    // Update cache
    currentRepository = repository;
    currentProjectId = projectId;
    currentAdapter = adaptersByProject.get(projectId);
    return repository;
  };

  // Get cached repository (sync) - throws if not initialized
  const getCachedRepository = () => {
    const projectId = getCurrentProjectId();
    if (!currentRepository || currentProjectId !== projectId) {
      throw new Error(
        "Repository not initialized. Call ensureRepository() first.",
      );
    }
    return currentRepository;
  };

  const getCachedAdapter = () => {
    const projectId = getCurrentProjectId();
    if (!currentAdapter || currentProjectId !== projectId) {
      throw new Error(
        "Adapter not initialized. Call ensureRepository() first.",
      );
    }
    return currentAdapter;
  };

  // File operations helpers
  const storeFile = async (file) => {
    const adapter = getCachedAdapter();
    const fileId = nanoid();
    const fileBlob = new Blob([await file.arrayBuffer()], { type: file.type });
    await adapter.setFile(fileId, fileBlob);
    return { fileId };
  };

  const getFileUrl = async (fileId) => {
    const adapter = getCachedAdapter();
    const blob = await adapter.getFile(fileId);
    if (!blob) {
      throw new Error(`File not found: ${fileId}`);
    }
    const url = URL.createObjectURL(blob);
    return { url, type: blob.type };
  };

  const getBundleStaticFiles = async () => {
    let indexHtml = null;
    let mainJs = null;

    try {
      const indexResponse = await fetch("/bundle/index.html");
      if (indexResponse.ok) {
        indexHtml = await indexResponse.text();
      }

      const mainJsResponse = await fetch("/bundle/main.js");
      if (mainJsResponse.ok) {
        mainJs = await mainJsResponse.text();
      }
    } catch (error) {
      console.error("Failed to fetch static bundle files:", error);
    }

    return { indexHtml, mainJs };
  };

  const storeMetadata = async (data) => {
    const jsonString = JSON.stringify(data, null, 2);
    const jsonBlob = new Blob([jsonString], { type: "application/json" });
    const uniqueName = `metadata_${nanoid()}.json`;
    Object.defineProperty(jsonBlob, "name", {
      value: uniqueName,
      writable: false,
    });
    return await storeFile(jsonBlob);
  };

  // File processors
  const processors = {
    image: async (file) => {
      const dimensions = await getImageDimensions(file);
      const { fileId } = await storeFile(file);
      return { fileId, dimensions, type: "image" };
    },
    audio: async (file) => {
      const arrayBuffer = await file.arrayBuffer();
      const fileForWaveform = new File([arrayBuffer], file.name, {
        type: file.type,
      });
      const fileForStorage = new File([arrayBuffer], file.name, {
        type: file.type,
      });

      const waveformData = await extractWaveformData(fileForWaveform);
      const { fileId } = await storeFile(fileForStorage);

      let waveformDataFileId = null;
      if (waveformData) {
        const compressedWaveformData = {
          ...waveformData,
          amplitudes: waveformData.amplitudes.map((value) =>
            Math.round(value * 255),
          ),
        };
        const waveformResult = await storeMetadata(compressedWaveformData);
        waveformDataFileId = waveformResult.fileId;
      }
      return {
        fileId,
        waveformDataFileId,
        waveformData,
        duration: waveformData?.duration,
        type: "audio",
      };
    },
    video: async (file) => {
      const [dimensions, thumbnailData] = await Promise.all([
        getVideoDimensions(file),
        extractVideoThumbnail(file, {
          timeOffset: 1,
          width: 240,
          height: 135,
          format: "image/jpeg",
          quality: 0.8,
        }),
      ]);
      const [videoResult, thumbnailResult] = await Promise.all([
        storeFile(file),
        storeFile(thumbnailData.blob),
      ]);
      return {
        fileId: videoResult.fileId,
        thumbnailFileId: thumbnailResult.fileId,
        thumbnailData,
        dimensions,
        type: "video",
      };
    },
    font: async (file) => {
      const fontName = file.name.replace(/\.(ttf|otf|woff|woff2|ttc)$/i, "");
      const fontUrl = URL.createObjectURL(file);

      try {
        await loadFont(fontName, fontUrl);
      } catch (loadError) {
        URL.revokeObjectURL(fontUrl);
        throw new Error(`Invalid font file: ${loadError.message}`);
      }

      const { fileId } = await storeFile(file);
      return { fileId, fontName, fontUrl, type: "font" };
    },
    generic: async (file) => {
      const { fileId } = await storeFile(file);
      return { fileId, type: "generic" };
    },
  };

  const processFile = async (file) => {
    const fileType = detectFileType(file);
    const processor = processors[fileType] || processors.generic;
    return processor(file);
  };

  const ensureTypedCommandContext = async () => {
    const repository = await getCurrentRepository();
    const currentProjectId = getCurrentProjectId();
    if (!currentProjectId) {
      throw new Error("No project selected (missing ?p= in URL)");
    }
    const state = repository.getState();
    assertV2State(state);

    const projectId = state.project?.id || currentProjectId;
    const session = await ensureCommandSessionForProject(currentProjectId);
    const actor =
      typeof session.getActor === "function"
        ? session.getActor()
        : getOrCreateLocalActor(currentProjectId);

    return {
      repository,
      state,
      session,
      actor,
      projectId,
      currentProjectId,
    };
  };

  const submitTypedCommandWithContext = async ({
    context,
    scope,
    type,
    payload,
    partitions = [],
    basePartition,
  }) => {
    const resolvedBasePartition =
      basePartition || `project:${context.projectId}:${scope}`;
    const command = createCommandEnvelope({
      projectId: context.projectId,
      scope,
      partition: resolvedBasePartition,
      partitions: uniquePartitions(resolvedBasePartition, ...partitions),
      type,
      payload,
      actor: context.actor,
    });

    await context.session.submitCommand(command);

    const applyResult = await applyTypedCommandToRepository({
      repository: context.repository,
      command,
      projectId: context.projectId,
    });

    return {
      commandId: command.id,
      eventCount: applyResult.events.length,
      applyMode: applyResult.mode,
    };
  };

  const resolveResourceIndex = ({
    state,
    resourceType,
    parentId,
    position,
    index,
    movingId = null,
  }) => {
    if (Number.isInteger(index)) return index;
    const collection = state?.[resourceType];
    const siblings = getSiblingOrderNodes(collection, parentId);
    return resolveIndexFromPosition({
      siblings,
      position,
      movingId,
    });
  };

  const resolveSceneIndex = ({
    state,
    parentId,
    position,
    index,
    movingId,
  }) => {
    if (Number.isInteger(index)) return index;
    const siblings = getSiblingOrderNodes(state?.scenes, parentId);
    return resolveIndexFromPosition({
      siblings,
      position,
      movingId,
    });
  };

  const resolveSectionIndex = ({
    scene,
    parentId,
    position,
    index,
    movingId,
  }) => {
    if (Number.isInteger(index)) return index;
    const siblings = getSiblingOrderNodes(scene?.sections, parentId);
    return resolveIndexFromPosition({
      siblings,
      position,
      movingId,
    });
  };

  const resolveLineIndex = ({
    section,
    parentId,
    position,
    index,
    movingId,
  }) => {
    if (Number.isInteger(index)) return index;
    const siblings = getSiblingOrderNodes(section?.lines, parentId);
    return resolveIndexFromPosition({
      siblings,
      position,
      movingId,
    });
  };

  const resolveLayoutElementIndex = ({
    layout,
    parentId,
    position,
    index,
    movingId,
  }) => {
    if (Number.isInteger(index)) return index;
    const siblings = getSiblingOrderNodes(layout?.elements, parentId);
    return resolveIndexFromPosition({
      siblings,
      position,
      movingId,
    });
  };

  return {
    // Repository access - uses current project from URL
    async getRepository() {
      return getCurrentRepository();
    },
    async getRepositoryById(projectId) {
      return getRepositoryByProject(projectId);
    },
    getAdapterById(projectId) {
      return adaptersByProject.get(projectId);
    },
    async ensureRepository() {
      return getCurrentRepository();
    },
    async updateProjectFields({ patch }) {
      const context = await ensureTypedCommandContext();
      const keys = Object.keys(patch || {}).filter(
        (key) =>
          key && key !== "id" && key !== "createdAt" && key !== "updatedAt",
      );
      if (keys.length === 0) return;

      await submitTypedCommandWithContext({
        context,
        scope: "settings",
        type: "project.update",
        payload: {
          patch: structuredClone(patch),
        },
        partitions: [],
      });
    },
    async createSceneItem({
      sceneId,
      name,
      parentId = null,
      position = "last",
      index,
      data = {},
    }) {
      const context = await ensureTypedCommandContext();
      const nextSceneId = sceneId || nanoid();
      const resolvedIndex = resolveSceneIndex({
        state: context.state,
        parentId,
        position,
        index,
      });
      const basePartition = storyBasePartitionFor(context.projectId);
      const scenePartition = storyScenePartitionFor(
        context.projectId,
        nextSceneId,
      );

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "scene.create",
        payload: {
          sceneId: nextSceneId,
          name,
          parentId: normalizeParentId(parentId),
          index: resolvedIndex,
          position,
          data: structuredClone(data || {}),
        },
        partitions: [basePartition, scenePartition],
      });
      return nextSceneId;
    },
    async updateSceneItem({ sceneId, patch }) {
      const context = await ensureTypedCommandContext();
      const basePartition = storyBasePartitionFor(context.projectId);
      const scenePartition = storyScenePartitionFor(context.projectId, sceneId);

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "scene.update",
        payload: {
          sceneId,
          patch: structuredClone(patch || {}),
        },
        partitions: [basePartition, scenePartition],
      });
    },
    async renameSceneItem({ sceneId, name }) {
      const context = await ensureTypedCommandContext();
      const basePartition = storyBasePartitionFor(context.projectId);
      const scenePartition = storyScenePartitionFor(context.projectId, sceneId);

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "scene.rename",
        payload: {
          sceneId,
          name,
        },
        partitions: [basePartition, scenePartition],
      });
    },
    async deleteSceneItem({ sceneId }) {
      const context = await ensureTypedCommandContext();
      const basePartition = storyBasePartitionFor(context.projectId);
      const scenePartition = storyScenePartitionFor(context.projectId, sceneId);

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "scene.delete",
        payload: {
          sceneId,
        },
        partitions: [basePartition, scenePartition],
      });
    },
    async setInitialScene({ sceneId }) {
      const context = await ensureTypedCommandContext();
      const basePartition = storyBasePartitionFor(context.projectId);
      const scenePartition = storyScenePartitionFor(context.projectId, sceneId);

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "scene.set_initial",
        payload: {
          sceneId,
        },
        partitions: [basePartition, scenePartition],
      });
    },
    async reorderSceneItem({
      sceneId,
      parentId = null,
      position = "last",
      index,
    }) {
      const context = await ensureTypedCommandContext();
      const resolvedIndex = resolveSceneIndex({
        state: context.state,
        parentId,
        position,
        index,
        movingId: sceneId,
      });
      const basePartition = storyBasePartitionFor(context.projectId);
      const scenePartition = storyScenePartitionFor(context.projectId, sceneId);

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "scene.reorder",
        payload: {
          sceneId,
          parentId: normalizeParentId(parentId),
          index: resolvedIndex,
          position,
        },
        partitions: [basePartition, scenePartition],
      });
    },
    async createSectionItem({
      sceneId,
      sectionId,
      name,
      parentId = null,
      position = "last",
      index,
      data = {},
    }) {
      const context = await ensureTypedCommandContext();
      const nextSectionId = sectionId || nanoid();
      const scene = context.state?.scenes?.items?.[sceneId];
      const resolvedIndex = resolveSectionIndex({
        scene,
        parentId,
        position,
        index,
      });
      const basePartition = storyBasePartitionFor(context.projectId);
      const scenePartition = storyScenePartitionFor(context.projectId, sceneId);

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "section.create",
        payload: {
          sceneId,
          sectionId: nextSectionId,
          name,
          parentId: normalizeParentId(parentId),
          index: resolvedIndex,
          position,
          data: structuredClone(data || {}),
        },
        partitions: [basePartition, scenePartition],
      });

      return nextSectionId;
    },
    async renameSectionItem({ sectionId, name }) {
      const context = await ensureTypedCommandContext();
      const basePartition = storyBasePartitionFor(context.projectId);
      const sectionLocation = findSectionLocation(context.state, sectionId);
      const scenePartition = sectionLocation?.sceneId
        ? storyScenePartitionFor(context.projectId, sectionLocation.sceneId)
        : null;

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "section.rename",
        payload: {
          sectionId,
          name,
        },
        partitions: scenePartition
          ? [basePartition, scenePartition]
          : [basePartition],
      });
    },
    async deleteSectionItem({ sectionId }) {
      const context = await ensureTypedCommandContext();
      const basePartition = storyBasePartitionFor(context.projectId);
      const sectionLocation = findSectionLocation(context.state, sectionId);
      const scenePartition = sectionLocation?.sceneId
        ? storyScenePartitionFor(context.projectId, sectionLocation.sceneId)
        : null;

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "section.delete",
        payload: {
          sectionId,
        },
        partitions: scenePartition
          ? [basePartition, scenePartition]
          : [basePartition],
      });
    },
    async reorderSectionItem({
      sectionId,
      parentId = null,
      position = "last",
      index,
    }) {
      const context = await ensureTypedCommandContext();
      const sectionLocation = findSectionLocation(context.state, sectionId);
      const resolvedIndex = resolveSectionIndex({
        scene: sectionLocation?.scene,
        parentId,
        position,
        index,
        movingId: sectionId,
      });
      const basePartition = storyBasePartitionFor(context.projectId);
      const scenePartition = sectionLocation?.sceneId
        ? storyScenePartitionFor(context.projectId, sectionLocation.sceneId)
        : null;

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "section.reorder",
        payload: {
          sectionId,
          parentId: normalizeParentId(parentId),
          index: resolvedIndex,
          position,
        },
        partitions: scenePartition
          ? [basePartition, scenePartition]
          : [basePartition],
      });
    },
    async createLineItem({
      sectionId,
      lineId,
      line = {},
      afterLineId,
      parentId = null,
      position,
      index,
    }) {
      const context = await ensureTypedCommandContext();
      const nextLineId = lineId || nanoid();
      const sectionLocation = findSectionLocation(context.state, sectionId);
      const resolvedPosition =
        position || (afterLineId ? { after: afterLineId } : undefined);
      const resolvedIndex = resolveLineIndex({
        section: sectionLocation?.section,
        parentId,
        position: resolvedPosition || "last",
        index,
      });
      const basePartition = storyBasePartitionFor(context.projectId);
      const scenePartition = sectionLocation?.sceneId
        ? storyScenePartitionFor(context.projectId, sectionLocation.sceneId)
        : null;

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "line.insert_after",
        payload: {
          sectionId,
          lineId: nextLineId,
          line: structuredClone(line || {}),
          afterLineId: afterLineId || null,
          parentId: normalizeParentId(parentId),
          index: resolvedIndex,
          position: resolvedPosition || "last",
        },
        partitions: scenePartition
          ? [basePartition, scenePartition]
          : [basePartition],
      });

      return nextLineId;
    },
    async updateLineActions({ lineId, patch, replace = false }) {
      const context = await ensureTypedCommandContext();
      const basePartition = storyBasePartitionFor(context.projectId);
      const lineLocation = findLineLocation(context.state, lineId);
      const scenePartition = lineLocation?.sceneId
        ? storyScenePartitionFor(context.projectId, lineLocation.sceneId)
        : null;

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "line.update_actions",
        payload: {
          lineId,
          patch: structuredClone(patch || {}),
          replace: replace === true,
        },
        partitions: scenePartition
          ? [basePartition, scenePartition]
          : [basePartition],
      });
    },
    async deleteLineItem({ lineId }) {
      const context = await ensureTypedCommandContext();
      const basePartition = storyBasePartitionFor(context.projectId);
      const lineLocation = findLineLocation(context.state, lineId);
      const scenePartition = lineLocation?.sceneId
        ? storyScenePartitionFor(context.projectId, lineLocation.sceneId)
        : null;

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "line.delete",
        payload: {
          lineId,
        },
        partitions: scenePartition
          ? [basePartition, scenePartition]
          : [basePartition],
      });
    },
    async moveLineItem({
      lineId,
      toSectionId,
      parentId = null,
      position = "last",
      index,
    }) {
      const context = await ensureTypedCommandContext();
      const targetSection = findSectionLocation(context.state, toSectionId);
      const resolvedIndex = resolveLineIndex({
        section: targetSection?.section,
        parentId,
        position,
        index,
        movingId: lineId,
      });
      const basePartition = storyBasePartitionFor(context.projectId);
      const sourceLine = findLineLocation(context.state, lineId);
      const sourceScenePartition = sourceLine?.sceneId
        ? storyScenePartitionFor(context.projectId, sourceLine.sceneId)
        : null;
      const targetScenePartition = targetSection?.sceneId
        ? storyScenePartitionFor(context.projectId, targetSection.sceneId)
        : null;

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "line.move",
        payload: {
          lineId,
          toSectionId,
          parentId: normalizeParentId(parentId),
          index: resolvedIndex,
          position,
        },
        partitions: [basePartition, sourceScenePartition, targetScenePartition],
      });
    },
    async createResourceItem({
      resourceType,
      resourceId,
      data,
      parentId = null,
      position = "last",
      index,
    }) {
      const context = await ensureTypedCommandContext();
      const nextResourceId = resourceId || nanoid();
      const resolvedIndex = resolveResourceIndex({
        state: context.state,
        resourceType,
        parentId,
        position,
        index,
      });
      const resourcePartition = resourceTypePartitionFor(
        context.projectId,
        resourceType,
      );

      await submitTypedCommandWithContext({
        context,
        scope: "resources",
        basePartition: resourcePartition,
        type: "resource.create",
        payload: {
          resourceType,
          resourceId: nextResourceId,
          data: structuredClone(data),
          parentId: normalizeParentId(parentId),
          index: resolvedIndex,
          position,
        },
        partitions: [],
      });
      return nextResourceId;
    },
    async updateResourceItem({ resourceType, resourceId, patch }) {
      const context = await ensureTypedCommandContext();
      const resourcePartition = resourceTypePartitionFor(
        context.projectId,
        resourceType,
      );

      await submitTypedCommandWithContext({
        context,
        scope: "resources",
        basePartition: resourcePartition,
        type: "resource.update",
        payload: {
          resourceType,
          resourceId,
          patch: structuredClone(patch),
        },
        partitions: [],
      });
    },
    async moveResourceItem({
      resourceType,
      resourceId,
      parentId = null,
      position = "last",
      index,
    }) {
      const context = await ensureTypedCommandContext();
      const resolvedIndex = resolveResourceIndex({
        state: context.state,
        resourceType,
        parentId,
        position,
        index,
        movingId: resourceId,
      });
      const resourcePartition = resourceTypePartitionFor(
        context.projectId,
        resourceType,
      );

      await submitTypedCommandWithContext({
        context,
        scope: "resources",
        basePartition: resourcePartition,
        type: "resource.move",
        payload: {
          resourceType,
          resourceId,
          parentId: normalizeParentId(parentId),
          index: resolvedIndex,
          position,
        },
        partitions: [],
      });
    },
    async deleteResourceItem({ resourceType, resourceId }) {
      const context = await ensureTypedCommandContext();
      const resourcePartition = resourceTypePartitionFor(
        context.projectId,
        resourceType,
      );

      await submitTypedCommandWithContext({
        context,
        scope: "resources",
        basePartition: resourcePartition,
        type: "resource.delete",
        payload: {
          resourceType,
          resourceId,
        },
        partitions: [],
      });
    },
    async duplicateResourceItem({
      resourceType,
      sourceId,
      newId,
      parentId,
      position,
      index,
      name,
    }) {
      const context = await ensureTypedCommandContext();
      const collection = context.state?.[resourceType];
      const sourceItem = collection?.items?.[sourceId];
      const resolvedParentId = normalizeParentId(
        parentId ?? sourceItem?.parentId ?? null,
      );
      const resolvedPosition = position || { after: sourceId };
      const resolvedIndex = resolveResourceIndex({
        state: context.state,
        resourceType,
        parentId: resolvedParentId,
        position: resolvedPosition,
        index,
      });
      const resourcePartition = resourceTypePartitionFor(
        context.projectId,
        resourceType,
      );

      await submitTypedCommandWithContext({
        context,
        scope: "resources",
        basePartition: resourcePartition,
        type: "resource.duplicate",
        payload: {
          resourceType,
          sourceId,
          newId,
          parentId: resolvedParentId,
          index: resolvedIndex,
          position: resolvedPosition,
          name: typeof name === "string" && name.length > 0 ? name : undefined,
        },
        partitions: [],
      });
    },
    async createLayoutItem({
      layoutId,
      name,
      layoutType = "normal",
      elements = createTreeCollection(),
      parentId = null,
      position = "last",
      data = {},
    }) {
      const context = await ensureTypedCommandContext();
      const nextLayoutId = layoutId || nanoid();

      await submitTypedCommandWithContext({
        context,
        scope: "layouts",
        type: "layout.create",
        payload: {
          layoutId: nextLayoutId,
          name,
          layoutType,
          elements: structuredClone(elements || createTreeCollection()),
          parentId: normalizeParentId(parentId),
          position,
          data: structuredClone(data || {}),
        },
        partitions: [],
      });

      return nextLayoutId;
    },
    async renameLayoutItem({ layoutId, name }) {
      const context = await ensureTypedCommandContext();

      await submitTypedCommandWithContext({
        context,
        scope: "layouts",
        type: "layout.rename",
        payload: {
          layoutId,
          name,
        },
        partitions: [],
      });
    },
    async deleteLayoutItem({ layoutId }) {
      const context = await ensureTypedCommandContext();

      await submitTypedCommandWithContext({
        context,
        scope: "layouts",
        type: "layout.delete",
        payload: {
          layoutId,
        },
        partitions: [],
      });
    },
    async updateLayoutElement({ layoutId, elementId, patch, replace = true }) {
      const context = await ensureTypedCommandContext();

      await submitTypedCommandWithContext({
        context,
        scope: "layouts",
        type: "layout.element.update",
        payload: {
          layoutId,
          elementId,
          patch: structuredClone(patch || {}),
          replace: replace === true,
        },
        partitions: [],
      });
    },
    async createLayoutElement({
      layoutId,
      elementId,
      element,
      parentId = null,
      position = "last",
      index,
    }) {
      const context = await ensureTypedCommandContext();
      const nextElementId = elementId || nanoid();
      const layout = context.state?.layouts?.items?.[layoutId];
      const resolvedIndex = resolveLayoutElementIndex({
        layout,
        parentId,
        position,
        index,
      });

      await submitTypedCommandWithContext({
        context,
        scope: "layouts",
        type: "layout.element.create",
        payload: {
          layoutId,
          elementId: nextElementId,
          element: structuredClone(element || {}),
          parentId: normalizeParentId(parentId),
          index: resolvedIndex,
          position,
        },
        partitions: [],
      });

      return nextElementId;
    },
    async moveLayoutElement({
      layoutId,
      elementId,
      parentId = null,
      position = "last",
      index,
    }) {
      const context = await ensureTypedCommandContext();
      const layout = context.state?.layouts?.items?.[layoutId];
      const resolvedIndex = resolveLayoutElementIndex({
        layout,
        parentId,
        position,
        index,
        movingId: elementId,
      });

      await submitTypedCommandWithContext({
        context,
        scope: "layouts",
        type: "layout.element.move",
        payload: {
          layoutId,
          elementId,
          parentId: normalizeParentId(parentId),
          index: resolvedIndex,
          position,
        },
        partitions: [],
      });
    },
    async deleteLayoutElement({ layoutId, elementId }) {
      const context = await ensureTypedCommandContext();

      await submitTypedCommandWithContext({
        context,
        scope: "layouts",
        type: "layout.element.delete",
        payload: {
          layoutId,
          elementId,
        },
        partitions: [],
      });
    },
    async createVariableItem({
      variableId,
      name,
      scope = "global",
      type = "string",
      defaultValue = "",
      parentId = null,
      position = "last",
    }) {
      const context = await ensureTypedCommandContext();
      const nextVariableId = variableId || nanoid();

      await submitTypedCommandWithContext({
        context,
        scope: "settings",
        type: "variable.create",
        payload: {
          variableId: nextVariableId,
          name,
          variableType: type,
          initialValue: defaultValue,
          parentId: normalizeParentId(parentId),
          position,
          data: {
            scope,
          },
        },
        partitions: [],
      });

      return nextVariableId;
    },
    async updateVariableItem({ variableId, patch }) {
      const context = await ensureTypedCommandContext();

      await submitTypedCommandWithContext({
        context,
        scope: "settings",
        type: "variable.update",
        payload: {
          variableId,
          patch: structuredClone(patch || {}),
        },
        partitions: [],
      });
    },
    async deleteVariableItem({ variableId }) {
      const context = await ensureTypedCommandContext();

      await submitTypedCommandWithContext({
        context,
        scope: "settings",
        type: "variable.delete",
        payload: {
          variableId,
        },
        partitions: [],
      });
    },
    async appendEvent(event) {
      void event;
      throw new Error(
        "appendEvent is no longer supported in typed-collab mode. Use typed command APIs.",
      );
    },
    getState() {
      const repository = getCachedRepository();
      const state = repository.getState();
      assertV2State(state);
      return state;
    },
    getDomainState() {
      const repositoryState = this.getState();
      const projectId =
        repositoryState?.project?.id || getCurrentProjectId() || "unknown-project";
      return projectRepositoryStateToDomainState({
        repositoryState,
        projectId,
      });
    },
    async getEvents() {
      const repository = await getCurrentRepository();
      return repository.getEvents();
    },
    async addVersionToProject(projectId, version) {
      let adapter = adaptersByProject.get(projectId);
      if (!adapter) {
        await getRepositoryByProject(projectId);
        adapter = adaptersByProject.get(projectId);
      }
      const versions = (await adapter.app.get("versions")) || [];
      versions.unshift(version);
      await adapter.app.set("versions", versions);
    },
    async deleteVersionFromProject(projectId, versionId) {
      let adapter = adaptersByProject.get(projectId);
      if (!adapter) {
        await getRepositoryByProject(projectId);
        adapter = adaptersByProject.get(projectId);
      }
      const versions = (await adapter.app.get("versions")) || [];
      const newVersions = versions.filter((v) => v.id !== versionId);
      await adapter.app.set("versions", newVersions);
    },
    async initializeProject({ name, description, projectId, template }) {
      return initializeWebProject({
        name,
        description,
        projectId,
        template,
      });
    },
    async createCollabSession({
      token,
      userId,
      clientId = nanoid(),
      endpointUrl,
      partitions,
    }) {
      const currentProjectId = getCurrentProjectId();
      if (!currentProjectId) {
        throw new Error("No project selected (missing ?p= in URL)");
      }
      collabLog("info", "createCollabSession called", {
        currentProjectId,
        endpointUrl: endpointUrl || null,
        hasToken: Boolean(token),
        userId,
        clientId,
      });

      const existing = collabSessionsByProject.get(currentProjectId);
      const existingMode = collabSessionModeByProject.get(currentProjectId);
      if (existing) {
        collabLog("info", "existing session found", {
          currentProjectId,
          existingMode,
        });
        const hasExplicitIdentity = Boolean(token && userId);
        if (hasExplicitIdentity && existingMode === "local") {
          await existing.stop();
          collabSessionsByProject.delete(currentProjectId);
          collabSessionModeByProject.delete(currentProjectId);
          collabApplyQueueByProject.delete(currentProjectId);
          collabAppliedCommittedIdsByProject.delete(currentProjectId);
          collabLog("info", "replaced local session with explicit identity", {
            currentProjectId,
          });
          updateCollabDiagnostics(currentProjectId, {
            status: "replaced_local_session",
          });
        } else {
          if (endpointUrl) {
            const transport = createWebSocketTransport({ url: endpointUrl });
            await existing.setOnlineTransport(transport);
            updateCollabDiagnostics(currentProjectId, {
              endpointUrl,
              status: "online_transport_updated",
            });
            collabLog("info", "updated existing session transport", {
              currentProjectId,
              endpointUrl,
            });
          }
          return existing;
        }
      }
      return createSessionForProject({
        projectId: currentProjectId,
        token,
        userId,
        clientId,
        endpointUrl,
        partitions,
        mode: "explicit",
      });
    },
    getCollabSession() {
      const currentProjectId = getCurrentProjectId();
      if (!currentProjectId) return null;
      return collabSessionsByProject.get(currentProjectId) || null;
    },
    getCollabDiagnostics(projectId) {
      const targetProjectId = projectId || getCurrentProjectId();
      if (!targetProjectId) return null;
      const session = collabSessionsByProject.get(targetProjectId) || null;
      const diagnostics =
        collabDiagnosticsByProject.get(targetProjectId) || null;
      return {
        ...diagnostics,
        hasSession: Boolean(session),
        sessionMode: collabSessionModeByProject.get(targetProjectId) || null,
        sessionError: session?.getLastError?.() || null,
      };
    },
    async stopCollabSession(projectId) {
      const targetProjectId = projectId || getCurrentProjectId();
      if (!targetProjectId) return;
      const session = collabSessionsByProject.get(targetProjectId);
      if (!session) return;
      await session.stop();
      collabSessionsByProject.delete(targetProjectId);
      collabSessionModeByProject.delete(targetProjectId);
      collabApplyQueueByProject.delete(targetProjectId);
      collabAppliedCommittedIdsByProject.delete(targetProjectId);
      updateCollabDiagnostics(targetProjectId, {
        status: "stopped",
      });
      collabLog("info", "session stopped", {
        projectId: targetProjectId,
      });
    },
    async submitCommand(command) {
      const session = this.getCollabSession();
      if (!session) {
        throw new Error(
          "Collaboration session not initialized. Call createCollabSession() first.",
        );
      }
      return session.submitCommand(command);
    },
    async uploadFiles(files) {
      const fileArray = Array.isArray(files) ? files : Array.from(files);
      const uploadPromises = fileArray.map(async (file) => {
        try {
          const result = await processFile(file);
          return {
            success: true,
            file,
            displayName: file.name.replace(/\.[^.]+$/, ""),
            ...result,
          };
        } catch (error) {
          console.error(`Failed to upload ${file.name}:`, error);
          return { success: false, file, error: error.message };
        }
      });
      const results = await Promise.all(uploadPromises);
      return results.filter((r) => r.success);
    },
    async getFileContent(fileId) {
      return await getFileUrl(fileId);
    },
    async downloadMetadata(fileId) {
      try {
        const { url } = await getFileUrl(fileId);
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          URL.revokeObjectURL(url);
          return data;
        }
        URL.revokeObjectURL(url);
        console.error("Failed to download metadata:", response.statusText);
        return null;
      } catch (error) {
        console.error("Failed to download metadata:", error);
        return null;
      }
    },
    async loadFontFile({ fontName, fileId }) {
      if (!fontName || !fileId || fileId === "undefined") {
        throw new Error(
          "Invalid font parameters: fontName and fileId are required.",
        );
      }
      try {
        const { url } = await getFileUrl(fileId);
        await loadFont(fontName, url);
        // Do not revoke here, font needs it
        return { success: true };
      } catch (error) {
        console.error("Failed to load font file:", error);
        return { success: false, error: error.message };
      }
    },
    detectFileType,
    createBundle(projectData, assets) {
      return createBundle(projectData, assets);
    },
    exportProject(projectData, files) {
      return createBundle(projectData, files);
    },
    async downloadBundle(bundle, filename) {
      await filePicker.saveFilePicker(
        new Blob([bundle], { type: "application/octet-stream" }),
        filename,
      );
      return filename; // In web, we don't get a path back
    },
    async createDistributionZip(bundle, zipName) {
      const zip = new JSZip();
      zip.file("package.bin", bundle);

      const { indexHtml, mainJs } = await getBundleStaticFiles();
      if (indexHtml) zip.file("index.html", indexHtml);
      if (mainJs) zip.file("main.js", mainJs);

      const zipBlob = await zip.generateAsync({ type: "blob" });
      await filePicker.saveFilePicker(zipBlob, `${zipName}.zip`);
      return `${zipName}.zip`;
    },
    async createDistributionZipStreamed(projectData, fileIds, zipName) {
      const uniqueFileIds = [];
      const seenFileIds = new Set();

      for (const fileId of fileIds || []) {
        if (!fileId || seenFileIds.has(fileId)) continue;
        seenFileIds.add(fileId);
        uniqueFileIds.push(fileId);
      }

      const files = {};
      for (const fileId of uniqueFileIds) {
        try {
          const content = await getFileUrl(fileId);
          const response = await fetch(content.url);
          const buffer = await response.arrayBuffer();
          files[fileId] = {
            buffer: new Uint8Array(buffer),
            mime: content.type,
          };
          URL.revokeObjectURL(content.url);
        } catch (error) {
          console.warn(`Failed to fetch file ${fileId}:`, error);
        }
      }

      const bundle = await createBundle(projectData, files);
      return await this.createDistributionZip(bundle, zipName);
    },
  };
};
