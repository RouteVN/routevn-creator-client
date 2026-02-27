import { commandToSyncEvent } from "../../../collab/v2/mappers.js";
import {
  COMMAND_VERSION,
  RESOURCE_TYPES,
} from "../../../domain/v2/constants.js";
import { validateCommand } from "../../../domain/v2/validateCommand.js";

const isSeedCommandId = (value) =>
  typeof value === "string" && value.startsWith("seed-");

const normalizePartitions = (partitions, fallbackPartitions = []) => {
  const output = [];
  const seen = new Set();
  const addPartition = (partition) => {
    if (typeof partition !== "string" || partition.length === 0) return;
    if (seen.has(partition)) return;
    seen.add(partition);
    output.push(partition);
  };

  for (const partition of Array.isArray(partitions) ? partitions : []) {
    addPartition(partition);
  }
  if (output.length === 0) {
    for (const partition of Array.isArray(fallbackPartitions)
      ? fallbackPartitions
      : []) {
      addPartition(partition);
    }
  }
  return output;
};

const getCommandPartitions = (command, fallbackPartitions = []) =>
  normalizePartitions(
    [
      ...(Array.isArray(command?.partitions) ? command.partitions : []),
      command?.partition,
    ],
    fallbackPartitions,
  );

const hasSeedableSnapshotContent = (snapshotState) => {
  if (!snapshotState || typeof snapshotState !== "object") return false;

  const hasProjectMetadata =
    (typeof snapshotState?.project?.name === "string" &&
      snapshotState.project.name.trim().length > 0) ||
    (typeof snapshotState?.project?.description === "string" &&
      snapshotState.project.description.trim().length > 0);

  const hasResources = RESOURCE_TYPES.some((resourceType) => {
    const items = snapshotState?.resources?.[resourceType]?.items;
    return items && Object.keys(items).length > 0;
  });

  const hasStory =
    (snapshotState?.story?.sceneOrder || []).length > 0 ||
    Object.keys(snapshotState?.scenes || {}).length > 0 ||
    Object.keys(snapshotState?.sections || {}).length > 0 ||
    Object.keys(snapshotState?.lines || {}).length > 0;

  const hasLayouts = Object.keys(snapshotState?.layouts || {}).length > 0;

  const variableItems = Object.values(snapshotState?.variables?.items || {});
  const hasVariables = variableItems.some(
    (item) => item && typeof item === "object" && item.type !== "folder",
  );

  return (
    hasProjectMetadata || hasResources || hasStory || hasLayouts || hasVariables
  );
};

const walkTreeWithPosition = (nodes, visit, parentId = null) => {
  if (!Array.isArray(nodes)) return;
  nodes.forEach((node, index) => {
    if (!node || typeof node.id !== "string" || node.id.length === 0) return;
    visit(node.id, parentId, index);
    walkTreeWithPosition(node.children || [], visit, node.id);
  });
};

const stripKeys = (value, keysToDrop = []) => {
  const clone = structuredClone(value || {});
  for (const key of keysToDrop) {
    delete clone[key];
  }
  return clone;
};

const stableStringify = (value) => {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
};

const hashSeedKey = (value) => {
  const input = String(value || "");
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h2 >>> 0).toString(36)}${(h1 >>> 0).toString(36)}`;
};

const buildDeterministicSeedCommandId = ({
  projectId,
  type,
  partition,
  partitions,
  payload,
  seedIndex,
}) => {
  const seedKey = stableStringify({
    projectId,
    type,
    partition,
    partitions,
    payload,
    seedIndex,
  });
  return `seed-${seedIndex}-${hashSeedKey(seedKey)}`;
};

const createSeedCommand = ({
  projectId,
  actor,
  type,
  payload,
  partition,
  partitions,
  seedIndex,
}) => {
  const resolvedPartitions = normalizePartitions(partitions, [partition]);
  const resolvedPartition = resolvedPartitions[0] || partition;
  return {
    id: buildDeterministicSeedCommandId({
      projectId,
      type,
      partition: resolvedPartition,
      partitions: resolvedPartitions,
      payload,
      seedIndex,
    }),
    projectId,
    partition: resolvedPartition,
    partitions: resolvedPartitions,
    type,
    payload: structuredClone(payload || {}),
    commandVersion: COMMAND_VERSION,
    actor: structuredClone(actor || {}),
    clientTs: Date.now() + seedIndex,
  };
};

const buildSeedCommandsFromSnapshotState = ({
  snapshotState,
  projectId,
  actor,
  partitioning,
}) => {
  if (!snapshotState || typeof snapshotState !== "object") {
    return {
      commands: [],
      summary: {
        snapshotCommands: 0,
        skippedSnapshotEntries: 1,
        skippedVariableFolders: 0,
      },
    };
  }

  if (!hasSeedableSnapshotContent(snapshotState)) {
    return {
      commands: [],
      summary: {
        snapshotCommands: 0,
        skippedSnapshotEntries: 0,
        skippedVariableFolders: 0,
        skippedBootstrapOnlySnapshot: 1,
      },
    };
  }

  const storyBasePartition = partitioning.storyBasePartitionFor(projectId);
  const settingsPartition = `project:${projectId}:settings`;
  const layoutsPartition = `project:${projectId}:layouts`;
  const commands = [];
  let commandSeedIndex = 0;
  let skippedSnapshotEntries = 0;
  let skippedVariableFolders = 0;

  const pushSeedCommand = ({
    type,
    payload,
    partition,
    partitions = [partition],
  }) => {
    commands.push(
      createSeedCommand({
        projectId,
        actor,
        type,
        payload,
        partition,
        partitions,
        seedIndex: commandSeedIndex,
      }),
    );
    commandSeedIndex += 1;
  };

  const projectPatch = {};
  const snapshotProjectName =
    typeof snapshotState?.project?.name === "string"
      ? snapshotState.project.name
      : "";
  if (snapshotProjectName.trim().length > 0) {
    projectPatch.name = snapshotProjectName;
  } else {
    projectPatch.name = `Project ${String(projectId).slice(0, 8)}`;
  }
  if (
    typeof snapshotState?.project?.description === "string" &&
    snapshotState.project.description.trim().length > 0
  ) {
    projectPatch.description = snapshotState.project.description;
  }
  pushSeedCommand({
    type: "project.update",
    payload: {
      patch: projectPatch,
    },
    partition: settingsPartition,
  });

  for (const resourceType of RESOURCE_TYPES) {
    const collection = snapshotState?.resources?.[resourceType];
    const items = collection?.items || {};
    walkTreeWithPosition(
      collection?.tree || [],
      (resourceId, parentId, index) => {
        const item = items[resourceId];
        if (!item || typeof item !== "object") {
          skippedSnapshotEntries += 1;
          return;
        }
        pushSeedCommand({
          type: "resource.create",
          payload: {
            resourceType,
            resourceId,
            data: stripKeys(item, ["id", "parentId", "createdAt", "updatedAt"]),
            parentId,
            index,
            position: "last",
          },
          partition: partitioning.resourceTypePartitionFor(
            projectId,
            resourceType,
          ),
        });
      },
    );
  }

  const sceneOrder = Array.isArray(snapshotState?.story?.sceneOrder)
    ? snapshotState.story.sceneOrder
    : Object.keys(snapshotState?.scenes || {});
  for (const [sceneIndex, sceneId] of sceneOrder.entries()) {
    const scene = snapshotState?.scenes?.[sceneId];
    if (!scene || typeof scene !== "object") {
      skippedSnapshotEntries += 1;
      continue;
    }
    const scenePartition = partitioning.storyScenePartitionFor(
      projectId,
      sceneId,
    );
    pushSeedCommand({
      type: "scene.create",
      payload: {
        sceneId,
        name: scene.name || `Scene ${sceneId}`,
        parentId: null,
        index: sceneIndex,
        position: "last",
        data: {},
      },
      partition: storyBasePartition,
      partitions: [storyBasePartition, scenePartition],
    });
    if (scene.position !== undefined) {
      pushSeedCommand({
        type: "scene.update",
        payload: {
          sceneId,
          patch: {
            position: structuredClone(scene.position),
          },
        },
        partition: storyBasePartition,
        partitions: [storyBasePartition, scenePartition],
      });
    }

    const sectionIds = Array.isArray(scene.sectionIds) ? scene.sectionIds : [];
    for (const [sectionIndex, sectionId] of sectionIds.entries()) {
      const section = snapshotState?.sections?.[sectionId];
      if (!section || typeof section !== "object") {
        skippedSnapshotEntries += 1;
        continue;
      }
      pushSeedCommand({
        type: "section.create",
        payload: {
          sceneId,
          sectionId,
          name: section.name || `Section ${sectionId}`,
          parentId: null,
          index: sectionIndex,
          position: "last",
          data: {},
        },
        partition: storyBasePartition,
        partitions: [storyBasePartition, scenePartition],
      });

      const lineIds = Array.isArray(section.lineIds) ? section.lineIds : [];
      let afterLineId = null;
      for (const lineId of lineIds) {
        const line = snapshotState?.lines?.[lineId];
        if (!line || typeof line !== "object") {
          skippedSnapshotEntries += 1;
          continue;
        }
        pushSeedCommand({
          type: "line.insert_after",
          payload: {
            sectionId,
            lineId,
            line: {
              actions: structuredClone(line.actions || {}),
            },
            afterLineId,
            parentId: null,
            position: "last",
          },
          partition: storyBasePartition,
          partitions: [storyBasePartition, scenePartition],
        });
        afterLineId = lineId;
      }
    }
  }

  const initialSceneId = snapshotState?.story?.initialSceneId;
  if (typeof initialSceneId === "string" && initialSceneId.length > 0) {
    pushSeedCommand({
      type: "scene.set_initial",
      payload: {
        sceneId: initialSceneId,
      },
      partition: storyBasePartition,
      partitions: [
        storyBasePartition,
        partitioning.storyScenePartitionFor(projectId, initialSceneId),
      ],
    });
  }

  for (const [layoutId, layout] of Object.entries(
    snapshotState?.layouts || {},
  )) {
    if (!layout || typeof layout !== "object") {
      skippedSnapshotEntries += 1;
      continue;
    }
    pushSeedCommand({
      type: "layout.create",
      payload: {
        layoutId,
        name: layout.name || `Layout ${layoutId}`,
        layoutType: layout.layoutType || "base",
        elements: { items: {}, tree: [] },
        parentId:
          typeof layout.parentId === "string" && layout.parentId.length > 0
            ? layout.parentId
            : null,
        position: "last",
        data: stripKeys(layout, [
          "id",
          "name",
          "layoutType",
          "elements",
          "rootElementOrder",
          "parentId",
          "children",
          "createdAt",
          "updatedAt",
        ]),
      },
      partition: layoutsPartition,
    });

    const visitedElementIds = new Set();
    const walkLayoutElements = (elementIds, parentId) => {
      if (!Array.isArray(elementIds)) return;
      elementIds.forEach((elementId, index) => {
        if (visitedElementIds.has(elementId)) return;
        visitedElementIds.add(elementId);
        const element = layout.elements?.[elementId];
        if (!element || typeof element !== "object") {
          skippedSnapshotEntries += 1;
          return;
        }
        pushSeedCommand({
          type: "layout.element.create",
          payload: {
            layoutId,
            elementId,
            element: stripKeys(element, ["id", "parentId", "children"]),
            parentId:
              typeof parentId === "string" && parentId.length > 0
                ? parentId
                : null,
            index,
            position: "last",
          },
          partition: layoutsPartition,
        });
        walkLayoutElements(element.children || [], elementId);
      });
    };

    walkLayoutElements(layout.rootElementOrder || [], null);
    const orphanElementIds = Object.keys(layout.elements || {}).filter(
      (elementId) => !visitedElementIds.has(elementId),
    );
    walkLayoutElements(orphanElementIds, null);
  }

  const variableItems = snapshotState?.variables?.items || {};
  walkTreeWithPosition(
    snapshotState?.variables?.tree || [],
    (variableId, parentId, index) => {
      const variable = variableItems[variableId];
      if (!variable || typeof variable !== "object") {
        skippedSnapshotEntries += 1;
        return;
      }
      if (variable.type === "folder") {
        skippedVariableFolders += 1;
        return;
      }
      const variableType =
        typeof variable.type === "string" && variable.type.length > 0
          ? variable.type
          : typeof variable.variableType === "string" &&
              variable.variableType.length > 0
            ? variable.variableType
            : "string";
      const initialValue = Object.prototype.hasOwnProperty.call(
        variable,
        "default",
      )
        ? structuredClone(variable.default)
        : structuredClone(variable.value ?? "");
      const resolvedVariableParentId =
        typeof parentId === "string" &&
        parentId.length > 0 &&
        variableItems[parentId] &&
        variableItems[parentId].type !== "folder"
          ? parentId
          : null;

      pushSeedCommand({
        type: "variable.create",
        payload: {
          variableId,
          name: variable.name || `Variable ${variableId}`,
          variableType,
          initialValue,
          parentId: resolvedVariableParentId,
          index,
          position: "last",
          data: stripKeys(variable, [
            "id",
            "name",
            "itemType",
            "type",
            "variableType",
            "default",
            "value",
            "parentId",
            "children",
            "createdAt",
            "updatedAt",
          ]),
        },
        partition: settingsPartition,
      });
    },
  );

  return {
    commands,
    summary: {
      snapshotCommands: commands.length,
      skippedSnapshotEntries,
      skippedVariableFolders,
    },
  };
};

export const buildSeedSyncEventsFromTypedEvents = ({
  typedEvents,
  projectId,
  actor,
  fallbackPartitions,
  partitioning,
}) => {
  const normalizedFallbackPartitions = normalizePartitions(fallbackPartitions);
  const seedEvents = [];
  const hasTypedCommandHistory = (typedEvents || []).some(
    (typedEvent) => typedEvent?.type === "typedCommand",
  );
  const summary = {
    sourceTypedEvents: Array.isArray(typedEvents) ? typedEvents.length : 0,
    snapshotCommandEvents: 0,
    commandEvents: 0,
    invalidCommandEvents: 0,
    skippedDomainEvents: 0,
    skippedTypedEvents: 0,
    skippedSnapshotsWithCommandHistory: 0,
    skippedSnapshotEntries: 0,
    skippedVariableFolders: 0,
    skippedBootstrapOnlySnapshot: 0,
  };

  for (const typedEvent of typedEvents || []) {
    if (!typedEvent || typeof typedEvent !== "object") {
      summary.skippedTypedEvents += 1;
      continue;
    }
    if (typedEvent.type === "typedSnapshot") {
      if (hasTypedCommandHistory) {
        summary.skippedSnapshotsWithCommandHistory += 1;
        continue;
      }
      const snapshotState = typedEvent?.payload?.state;
      if (!snapshotState || typeof snapshotState !== "object") {
        summary.skippedTypedEvents += 1;
        continue;
      }
      const snapshotSeed = buildSeedCommandsFromSnapshotState({
        snapshotState,
        projectId,
        actor,
        partitioning,
      });
      for (const command of snapshotSeed.commands) {
        try {
          validateCommand(command);
        } catch {
          summary.invalidCommandEvents += 1;
          continue;
        }
        seedEvents.push({
          commandId: command.id,
          command,
          partitions: getCommandPartitions(
            command,
            normalizedFallbackPartitions,
          ),
          event: commandToSyncEvent(command),
        });
      }
      summary.snapshotCommandEvents += snapshotSeed.commands.length;
      summary.skippedSnapshotEntries +=
        snapshotSeed.summary.skippedSnapshotEntries;
      summary.skippedVariableFolders +=
        snapshotSeed.summary.skippedVariableFolders;
      summary.skippedBootstrapOnlySnapshot +=
        snapshotSeed.summary.skippedBootstrapOnlySnapshot || 0;
      continue;
    }
    if (typedEvent.type === "typedCommand") {
      const command = typedEvent?.payload?.command;
      if (
        !command ||
        typeof command !== "object" ||
        typeof command.type !== "string" ||
        command.type.length === 0
      ) {
        summary.skippedTypedEvents += 1;
        continue;
      }
      try {
        validateCommand(command);
      } catch {
        summary.invalidCommandEvents += 1;
        continue;
      }
      seedEvents.push({
        commandId: command.id,
        command,
        partitions: getCommandPartitions(command, normalizedFallbackPartitions),
        event: commandToSyncEvent(command),
      });
      summary.commandEvents += 1;
      continue;
    }
    if (typedEvent.type === "typedDomainEvent") {
      summary.skippedDomainEvents += 1;
      continue;
    }
    summary.skippedTypedEvents += 1;
  }

  return { seedEvents, summary };
};

export const sanitizeLocalTypedEventsForReplay = ({ events }) => {
  const sourceEvents = Array.isArray(events) ? events : [];
  const sanitizedEvents = [];
  let removedSeedCommandEvents = 0;
  let removedSeedDomainEvents = 0;

  for (const event of sourceEvents) {
    if (!event || typeof event !== "object") {
      sanitizedEvents.push(event);
      continue;
    }

    if (
      event.type === "typedCommand" &&
      isSeedCommandId(event?.payload?.command?.id)
    ) {
      removedSeedCommandEvents += 1;
      continue;
    }

    if (
      event.type === "typedDomainEvent" &&
      isSeedCommandId(event?.payload?.event?.meta?.commandId)
    ) {
      removedSeedDomainEvents += 1;
      continue;
    }

    sanitizedEvents.push(event);
  }

  return {
    events: sanitizedEvents,
    removedSeedCommandEvents,
    removedSeedDomainEvents,
    removedEventCount: removedSeedCommandEvents + removedSeedDomainEvents,
  };
};
