import {
  findLineLocation,
  findSectionLocation,
  getSiblingOrderNodes,
} from "../projectRepository.js";
import { COMMAND_TYPES } from "../../../../internal/project/commands.js";

export const createStoryCommandApi = (shared) => {
  const appendMissingIds = (orderedIds, allIds) => {
    const seen = new Set();
    const result = [];

    for (const id of orderedIds || []) {
      if (!allIds.includes(id) || seen.has(id)) {
        continue;
      }

      seen.add(id);
      result.push(id);
    }

    for (const id of allIds || []) {
      if (seen.has(id)) {
        continue;
      }

      seen.add(id);
      result.push(id);
    }

    return result;
  };

  const getOrderedLineIds = (section) => {
    const lineItems = section?.lines?.items || {};
    const fallbackIds = Object.keys(lineItems);
    const orderedFromTree = getSiblingOrderNodes(section?.lines, null)
      .map((node) => node?.id)
      .filter(Boolean);

    return appendMissingIds(orderedFromTree, fallbackIds);
  };

  const getUniqueSceneIds = (sceneIds = []) => {
    const uniqueSceneIds = [];
    const seen = new Set();
    for (const sceneId of sceneIds) {
      if (typeof sceneId !== "string" || sceneId.length === 0) {
        continue;
      }
      if (seen.has(sceneId)) {
        continue;
      }
      seen.add(sceneId);
      uniqueSceneIds.push(sceneId);
    }
    return uniqueSceneIds;
  };

  const getSingleSceneId = (sceneIds = []) => {
    const uniqueSceneIds = getUniqueSceneIds(sceneIds);
    return uniqueSceneIds.length === 1 ? uniqueSceneIds[0] : null;
  };

  const getMainScenePartition = (context, sceneIds = []) => {
    const sceneId = getSingleSceneId(sceneIds);
    if (!sceneId) {
      return shared.storyBasePartitionFor(context.projectId);
    }
    return shared.storyScenePartitionFor(context.projectId, sceneId);
  };

  const getSceneOnlyPartition = (context, sceneIds = []) => {
    const sceneId = getSingleSceneId(sceneIds);
    if (!sceneId) {
      return shared.storyBasePartitionFor(context.projectId);
    }
    return shared.scenePartitionFor(context.projectId, sceneId);
  };

  const getStoryLinePartition = (context, lineIds) => {
    for (const lineId of lineIds || []) {
      const lineLocation = findLineLocation(context.state, lineId);
      if (lineLocation?.sceneId) {
        return shared.scenePartitionFor(
          context.projectId,
          lineLocation.sceneId,
        );
      }
    }

    throw new Error("Could not resolve scene partition for line command");
  };

  const buildLineActionsPayload = ({
    lineId,
    data,
    replace = false,
    preserve,
  }) => {
    const payload = {
      lineId,
      data: structuredClone(data || {}),
    };

    if (replace === true) {
      payload.replace = true;
    }

    if (Array.isArray(preserve) && preserve.length > 0) {
      payload.preserve = structuredClone(preserve);
    }

    return payload;
  };

  const groupLineIdsByScene = (context, lineIds = []) => {
    const grouped = new Map();

    for (const lineId of lineIds || []) {
      const lineLocation = findLineLocation(context.state, lineId);
      if (!lineLocation?.sceneId) {
        continue;
      }

      const existing = grouped.get(lineLocation.sceneId) || [];
      existing.push(lineId);
      grouped.set(lineLocation.sceneId, existing);
    }

    return grouped;
  };

  const submitLineActionsData = async ({
    lineId,
    data,
    replace = false,
    preserve,
  }) => {
    const context = await shared.ensureCommandContext({
      lineIds: [lineId],
    });

    return shared.submitCommandWithContext({
      context,
      scope: "story",
      partition: getStoryLinePartition(context, [lineId]),
      type: COMMAND_TYPES.LINE_UPDATE_ACTIONS,
      payload: buildLineActionsPayload({
        lineId,
        data,
        replace,
        preserve,
      }),
    });
  };

  return {
    async updateLineActions({ lineId, data, replace = false, preserve }) {
      return submitLineActionsData({
        lineId,
        data,
        replace,
        preserve,
      });
    },

    async updateLineAction({ lineId, actionType, action }) {
      if (typeof actionType !== "string" || actionType.length === 0) {
        throw new Error("actionType is required");
      }

      return submitLineActionsData({
        lineId,
        data: {
          [actionType]: structuredClone(action || {}),
        },
        replace: false,
      });
    },

    async updateLineDialogueAction({ lineId, dialogue, preserve }) {
      return submitLineActionsData({
        lineId,
        data: {
          dialogue: structuredClone(dialogue || {}),
        },
        replace: false,
        preserve,
      });
    },

    async updateLineDialogueActionsBatch({ updates }) {
      const normalizedUpdates = Array.isArray(updates) ? updates : [];
      if (normalizedUpdates.length === 0) {
        return {
          valid: true,
          commandIds: [],
          eventCount: 0,
        };
      }

      const context = await shared.ensureCommandContext({
        lineIds: normalizedUpdates.map(({ lineId }) => lineId),
      });
      return shared.submitCommandsWithContext({
        context,
        commands: normalizedUpdates.map(({ lineId, dialogue }) => ({
          scope: "story",
          type: COMMAND_TYPES.LINE_UPDATE_ACTIONS,
          payload: buildLineActionsPayload({
            lineId,
            data: {
              dialogue,
            },
          }),
          partition: getStoryLinePartition(context, [lineId]),
        })),
      });
    },

    async splitLineItem({
      lineId,
      sectionId,
      newLineId,
      leftDialogue,
      newLineData = {},
      position = "after",
      positionTargetId,
    }) {
      const context = await shared.ensureCommandContext({
        lineIds: [lineId],
      });
      const partition = getStoryLinePartition(context, [lineId]);

      return shared.submitCommandsWithContext({
        context,
        commands: [
          {
            scope: "story",
            type: COMMAND_TYPES.LINE_UPDATE_ACTIONS,
            payload: buildLineActionsPayload({
              lineId,
              data: {
                dialogue: leftDialogue,
              },
            }),
            partition,
          },
          {
            scope: "story",
            type: COMMAND_TYPES.LINE_CREATE,
            payload: {
              sectionId,
              lines: [
                {
                  lineId: newLineId || shared.createId(),
                  data: structuredClone(newLineData || {}),
                },
              ],
              position,
              positionTargetId,
            },
            partition,
          },
        ],
      });
    },

    async mergeLineItem({ previousLineId, currentLineId, mergedDialogue }) {
      const context = await shared.ensureCommandContext({
        lineIds: [previousLineId, currentLineId],
      });
      const partition = getStoryLinePartition(context, [
        previousLineId,
        currentLineId,
      ]);

      return shared.submitCommandsWithContext({
        context,
        commands: [
          {
            scope: "story",
            type: COMMAND_TYPES.LINE_UPDATE_ACTIONS,
            payload: buildLineActionsPayload({
              lineId: previousLineId,
              data: {
                dialogue: mergedDialogue,
              },
            }),
            partition,
          },
          {
            scope: "story",
            type: COMMAND_TYPES.LINE_DELETE,
            payload: {
              lineIds: [currentLineId],
            },
            partition,
          },
        ],
      });
    },

    async syncSectionLinesSnapshot({ sectionId, lines = [] }) {
      const context = await shared.ensureCommandContext({
        sectionIds: [sectionId],
      });
      const sectionLocation = findSectionLocation(context.state, sectionId);
      if (!sectionLocation?.section) {
        throw new Error("section not found");
      }

      const partition = getSceneOnlyPartition(context, [
        sectionLocation.sceneId,
      ]);

      const desiredLines = Array.isArray(lines)
        ? lines.filter((line) => typeof line?.id === "string" && line.id)
        : [];
      const desiredLineIds = desiredLines.map((line) => line.id);
      const desiredLineIdsSet = new Set(desiredLineIds);
      const desiredLineById = new Map(
        desiredLines.map((line) => [line.id, structuredClone(line)]),
      );

      const currentSection = sectionLocation.section;
      const currentLineIds = getOrderedLineIds(currentSection);
      const currentLineIdsSet = new Set(currentLineIds);
      const currentLineItems = currentSection?.lines?.items || {};
      const commands = [];

      const deletedLineIds = currentLineIds.filter(
        (lineId) => !desiredLineIdsSet.has(lineId),
      );
      if (deletedLineIds.length > 0) {
        commands.push({
          scope: "story",
          type: COMMAND_TYPES.LINE_DELETE,
          payload: {
            lineIds: deletedLineIds,
          },
          partition,
        });
      }

      const workingOrder = currentLineIds.filter((lineId) =>
        desiredLineIdsSet.has(lineId),
      );

      for (let index = 0; index < desiredLineIds.length; index += 1) {
        const desiredLineId = desiredLineIds[index];

        if (!currentLineIdsSet.has(desiredLineId)) {
          const newLines = [];
          let scanIndex = index;

          while (scanIndex < desiredLineIds.length) {
            const nextLineId = desiredLineIds[scanIndex];
            if (currentLineIdsSet.has(nextLineId)) {
              break;
            }

            const nextLine = desiredLineById.get(nextLineId);
            if (nextLine) {
              newLines.push({
                lineId: nextLine.id,
                data: {
                  actions: structuredClone(nextLine.actions || {}),
                },
              });
            }
            scanIndex += 1;
          }

          if (newLines.length > 0) {
            commands.push({
              scope: "story",
              type: COMMAND_TYPES.LINE_CREATE,
              payload: {
                sectionId,
                lines: newLines,
                index,
              },
              partition,
            });
            workingOrder.splice(
              index,
              0,
              ...newLines.map((line) => line.lineId),
            );
          }

          index = scanIndex - 1;
          continue;
        }

        const currentIndex = workingOrder.indexOf(desiredLineId);
        if (currentIndex >= 0 && currentIndex !== index) {
          commands.push({
            scope: "story",
            type: COMMAND_TYPES.LINE_MOVE,
            payload: {
              lineId: desiredLineId,
              toSectionId: sectionId,
              index,
            },
            partition,
          });

          workingOrder.splice(currentIndex, 1);
          workingOrder.splice(index, 0, desiredLineId);
        }
      }

      for (const lineId of desiredLineIds) {
        if (!currentLineIdsSet.has(lineId)) {
          continue;
        }

        const desiredLine = desiredLineById.get(lineId);
        const currentLine = currentLineItems[lineId];
        const desiredDialogue = desiredLine?.actions?.dialogue || {};
        const currentDialogue = currentLine?.actions?.dialogue || {};

        if (
          JSON.stringify(currentDialogue) === JSON.stringify(desiredDialogue)
        ) {
          continue;
        }

        commands.push({
          scope: "story",
          type: COMMAND_TYPES.LINE_UPDATE_ACTIONS,
          payload: buildLineActionsPayload({
            lineId,
            data: {
              dialogue: desiredDialogue,
            },
          }),
          partition,
        });
      }

      if (commands.length === 0) {
        return {
          valid: true,
          commandIds: [],
          eventCount: 0,
        };
      }

      return shared.submitCommandsWithContext({
        context,
        commands,
      });
    },

    async createSceneItem({
      sceneId,
      parentId = null,
      position = "last",
      positionTargetId,
      index,
      data = {},
      name,
    }) {
      const context = await shared.ensureCommandContext();
      const finalSceneId = sceneId || shared.createId();
      const resolvedIndex = shared.resolveSceneIndex({
        state: context.state,
        parentId,
        position,
        positionTargetId,
        index,
      });
      const nextData = structuredClone(data || {});
      if (name !== undefined) {
        nextData.name = name;
      }

      const submitResult = await shared.submitCommandWithContext({
        context,
        scope: "story",
        partition: getMainScenePartition(context, [finalSceneId]),
        type: COMMAND_TYPES.SCENE_CREATE,
        payload: {
          sceneId: finalSceneId,
          ...shared.buildPlacementPayload({
            parentId,
            index: resolvedIndex,
            position,
            positionTargetId,
          }),
          data: nextData,
        },
      });

      if (submitResult?.valid === false) {
        return submitResult;
      }

      return finalSceneId;
    },

    async updateSceneItem({ sceneId, data }) {
      const context = await shared.ensureCommandContext({
        sceneIds: [sceneId],
      });

      return shared.submitCommandWithContext({
        context,
        scope: "story",
        partition: getMainScenePartition(context, [sceneId]),
        type: COMMAND_TYPES.SCENE_UPDATE,
        payload: {
          sceneId,
          data: structuredClone(data || {}),
        },
      });
    },

    async deleteSceneItem({ sceneIds }) {
      const context = await shared.ensureCommandContext({
        sceneIds: structuredClone(sceneIds || []),
      });

      return shared.submitCommandWithContext({
        context,
        scope: "story",
        partition: getMainScenePartition(context, sceneIds),
        type: COMMAND_TYPES.SCENE_DELETE,
        payload: {
          sceneIds: structuredClone(sceneIds || []),
        },
      });
    },

    async setInitialScene({ sceneId }) {
      const context = await shared.ensureCommandContext();

      return shared.submitCommandWithContext({
        context,
        scope: "story",
        partition: shared.storyBasePartitionFor(context.projectId),
        type: COMMAND_TYPES.STORY_UPDATE,
        payload: {
          data: {
            initialSceneId: sceneId,
          },
        },
      });
    },

    async reorderSceneItem({
      sceneId,
      parentId = null,
      position = "last",
      positionTargetId,
      index,
    }) {
      const context = await shared.ensureCommandContext();
      const resolvedIndex = shared.resolveSceneIndex({
        state: context.state,
        parentId,
        position,
        positionTargetId,
        index,
        movingId: sceneId,
      });
      return shared.submitCommandWithContext({
        context,
        scope: "story",
        partition: getMainScenePartition(context, [sceneId]),
        type: COMMAND_TYPES.SCENE_MOVE,
        payload: {
          sceneId,
          ...shared.buildPlacementPayload({
            parentId,
            index: resolvedIndex,
            position,
            positionTargetId,
          }),
        },
      });
    },

    async createSectionItem({
      sceneId,
      sectionId,
      parentId = null,
      position = "last",
      positionTargetId,
      index,
      data = {},
      name,
    }) {
      const context = await shared.ensureCommandContext();
      const nextSectionId = sectionId || shared.createId();
      const scene = context.state?.scenes?.items?.[sceneId];
      const resolvedIndex = shared.resolveSectionIndex({
        scene,
        parentId,
        position,
        positionTargetId,
        index,
      });
      const nextData = structuredClone(data || {});
      if (name !== undefined) {
        nextData.name = name;
      }

      const submitResult = await shared.submitCommandWithContext({
        context,
        scope: "story",
        partition: getMainScenePartition(context, [sceneId]),
        type: COMMAND_TYPES.SECTION_CREATE,
        payload: {
          sceneId,
          sectionId: nextSectionId,
          ...shared.buildPlacementPayload({
            parentId,
            index: resolvedIndex,
            position,
            positionTargetId,
          }),
          data: nextData,
        },
      });

      if (submitResult?.valid === false) {
        return submitResult;
      }

      return nextSectionId;
    },

    async renameSectionItem({ sceneId, sectionId, name }) {
      const context = await shared.ensureCommandContext();
      const sectionLocation = findSectionLocation(context.state, sectionId);
      const sceneIdForPartition = sceneId || sectionLocation?.sceneId;

      return shared.submitCommandWithContext({
        context,
        scope: "story",
        partition: getMainScenePartition(context, [sceneIdForPartition]),
        type: COMMAND_TYPES.SECTION_UPDATE,
        payload: {
          sectionId,
          data: {
            name,
          },
        },
      });
    },

    async deleteSectionItem({ sceneId, sectionIds }) {
      const context = await shared.ensureCommandContext();
      const sceneIdsForPartitions = new Set();

      if (typeof sceneId === "string" && sceneId.length > 0) {
        sceneIdsForPartitions.add(sceneId);
      }

      for (const id of sectionIds || []) {
        const sectionLocation = findSectionLocation(context.state, id);
        if (sectionLocation?.sceneId) {
          sceneIdsForPartitions.add(sectionLocation.sceneId);
        }
      }

      return shared.submitCommandWithContext({
        context,
        scope: "story",
        partition: getMainScenePartition(context, [...sceneIdsForPartitions]),
        type: COMMAND_TYPES.SECTION_DELETE,
        payload: {
          sectionIds: structuredClone(sectionIds || []),
        },
      });
    },

    async reorderSectionItem({
      sectionId,
      parentId = null,
      position = "last",
      positionTargetId,
      index,
    }) {
      const context = await shared.ensureCommandContext();
      const sectionLocation = findSectionLocation(context.state, sectionId);
      const resolvedIndex = shared.resolveSectionIndex({
        scene: sectionLocation?.scene,
        parentId,
        position,
        positionTargetId,
        index,
        movingId: sectionId,
      });
      return shared.submitCommandWithContext({
        context,
        scope: "story",
        partition: getMainScenePartition(context, [sectionLocation?.sceneId]),
        type: COMMAND_TYPES.SECTION_MOVE,
        payload: {
          sectionId,
          ...shared.buildPlacementPayload({
            parentId,
            index: resolvedIndex,
            position,
            positionTargetId,
          }),
        },
      });
    },

    async createLineItem({
      sectionId,
      lines,
      lineId,
      data = {},
      parentId = null,
      position,
      positionTargetId,
      index,
    }) {
      const context = await shared.ensureCommandContext();
      let normalizedLines;
      if (Array.isArray(lines) && lines.length > 0) {
        normalizedLines = lines.map((item) => ({
          lineId: item?.lineId || shared.createId(),
          data: structuredClone(item?.data ?? item?.line ?? {}),
        }));
      } else {
        normalizedLines = [
          {
            lineId: lineId || shared.createId(),
            data: structuredClone(data || {}),
          },
        ];
      }
      const sectionLocation = findSectionLocation(context.state, sectionId);
      const resolvedIndex = shared.resolveLineIndex({
        section: sectionLocation?.section,
        parentId,
        position: position || "last",
        positionTargetId,
        index,
      });
      const submitResult = await shared.submitCommandWithContext({
        context,
        scope: "story",
        partition: getSceneOnlyPartition(context, [sectionLocation?.sceneId]),
        type: COMMAND_TYPES.LINE_CREATE,
        payload: {
          sectionId,
          lines: normalizedLines,
          ...(resolvedIndex !== undefined
            ? { index: resolvedIndex }
            : {
                position: position || "last",
                ...(positionTargetId !== undefined ? { positionTargetId } : {}),
              }),
        },
      });

      if (submitResult?.valid === false) {
        return submitResult;
      }

      if (normalizedLines.length === 1) {
        return normalizedLines[0].lineId;
      }

      return normalizedLines.map((item) => item.lineId);
    },

    async deleteLineItem({ lineIds }) {
      const normalizedLineIds = structuredClone(lineIds || []);
      const context = await shared.ensureCommandContext({
        lineIds: normalizedLineIds,
      });
      const lineIdsByScene = groupLineIdsByScene(context, normalizedLineIds);

      if (lineIdsByScene.size === 0) {
        return {
          valid: true,
          commandIds: [],
          eventCount: 0,
        };
      }

      return shared.submitCommandsWithContext({
        context,
        commands: [...lineIdsByScene.entries()].map(
          ([sceneId, scopedLineIds]) => ({
            scope: "story",
            partition: shared.scenePartitionFor(context.projectId, sceneId),
            type: COMMAND_TYPES.LINE_DELETE,
            payload: {
              lineIds: scopedLineIds,
            },
          }),
        ),
      });
    },

    async moveLineItem({
      lineId,
      toSectionId,
      parentId = null,
      position = "last",
      positionTargetId,
      index,
    }) {
      const context = await shared.ensureCommandContext({
        lineIds: [lineId],
        sectionIds: [toSectionId],
      });
      const targetSection = findSectionLocation(context.state, toSectionId);
      const resolvedIndex = shared.resolveLineIndex({
        section: targetSection?.section,
        parentId,
        position,
        positionTargetId,
        index,
        movingId: lineId,
      });
      const sourceLine = findLineLocation(context.state, lineId);
      const sourceSceneId = sourceLine?.sceneId;
      const targetSceneId = targetSection?.sceneId;

      if (!sourceSceneId) {
        throw new Error("line.move source line not found");
      }

      if (!targetSceneId) {
        throw new Error("line.move target section not found");
      }

      if (sourceSceneId !== targetSceneId) {
        return shared.submitCommandsWithContext({
          context,
          commands: [
            {
              scope: "story",
              partition: shared.scenePartitionFor(
                context.projectId,
                sourceSceneId,
              ),
              type: COMMAND_TYPES.LINE_DELETE,
              payload: {
                lineIds: [lineId],
              },
            },
            {
              scope: "story",
              partition: shared.scenePartitionFor(
                context.projectId,
                targetSceneId,
              ),
              type: COMMAND_TYPES.LINE_CREATE,
              payload: {
                sectionId: toSectionId,
                lines: [
                  {
                    lineId,
                    data: {
                      actions: structuredClone(sourceLine?.line?.actions || {}),
                    },
                  },
                ],
                ...(resolvedIndex !== undefined
                  ? { index: resolvedIndex }
                  : {
                      position,
                      ...(positionTargetId !== undefined
                        ? { positionTargetId }
                        : {}),
                    }),
              },
            },
          ],
        });
      }

      return shared.submitCommandWithContext({
        context,
        scope: "story",
        partition: shared.scenePartitionFor(context.projectId, sourceSceneId),
        type: COMMAND_TYPES.LINE_MOVE,
        payload: {
          lineId,
          toSectionId,
          ...(resolvedIndex !== undefined
            ? { index: resolvedIndex }
            : {
                position,
                ...(positionTargetId !== undefined ? { positionTargetId } : {}),
              }),
        },
      });
    },
  };
};
