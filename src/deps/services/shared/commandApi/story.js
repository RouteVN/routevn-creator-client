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

  const getStoryLinePartitions = (context, lineIds) => {
    const basePartition = shared.storyBasePartitionFor(context.projectId);
    const partitions = [basePartition];
    const seenSceneIds = new Set();

    for (const lineId of lineIds || []) {
      const lineLocation = findLineLocation(context.state, lineId);
      if (!lineLocation?.sceneId || seenSceneIds.has(lineLocation.sceneId)) {
        continue;
      }

      seenSceneIds.add(lineLocation.sceneId);
      partitions.push(
        shared.storyScenePartitionFor(context.projectId, lineLocation.sceneId),
      );
    }

    return partitions;
  };

  const submitLineActionsData = async ({ lineId, data, replace = false }) => {
    const context = await shared.ensureCommandContext();
    const partitions = getStoryLinePartitions(context, [lineId]);

    return shared.submitCommandWithContext({
      context,
      scope: "story",
      type: COMMAND_TYPES.LINE_UPDATE_ACTIONS,
      payload: {
        lineId,
        data: structuredClone(data || {}),
        replace: replace === true,
      },
      partitions,
    });
  };

  return {
    async updateLineActions({ lineId, data, replace = false }) {
      return submitLineActionsData({
        lineId,
        data,
        replace,
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

    async updateLineDialogueAction({ lineId, dialogue }) {
      return submitLineActionsData({
        lineId,
        data: {
          dialogue: structuredClone(dialogue || {}),
        },
        replace: false,
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

      const context = await shared.ensureCommandContext();
      return shared.submitCommandsWithContext({
        context,
        commands: normalizedUpdates.map(({ lineId, dialogue }) => ({
          scope: "story",
          type: COMMAND_TYPES.LINE_UPDATE_ACTIONS,
          payload: {
            lineId,
            data: {
              dialogue: structuredClone(dialogue || {}),
            },
            replace: false,
          },
          partitions: getStoryLinePartitions(context, [lineId]),
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
      const context = await shared.ensureCommandContext();
      const partitions = getStoryLinePartitions(context, [lineId]);

      return shared.submitCommandsWithContext({
        context,
        commands: [
          {
            scope: "story",
            type: COMMAND_TYPES.LINE_UPDATE_ACTIONS,
            payload: {
              lineId,
              data: {
                dialogue: structuredClone(leftDialogue || {}),
              },
              replace: false,
            },
            partitions,
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
            partitions,
          },
        ],
      });
    },

    async mergeLineItem({ previousLineId, currentLineId, mergedDialogue }) {
      const context = await shared.ensureCommandContext();
      const partitions = getStoryLinePartitions(context, [
        previousLineId,
        currentLineId,
      ]);

      return shared.submitCommandsWithContext({
        context,
        commands: [
          {
            scope: "story",
            type: COMMAND_TYPES.LINE_UPDATE_ACTIONS,
            payload: {
              lineId: previousLineId,
              data: {
                dialogue: structuredClone(mergedDialogue || {}),
              },
              replace: false,
            },
            partitions,
          },
          {
            scope: "story",
            type: COMMAND_TYPES.LINE_DELETE,
            payload: {
              lineIds: [currentLineId],
            },
            partitions,
          },
        ],
      });
    },

    async syncSectionLinesSnapshot({ sectionId, lines = [] }) {
      const context = await shared.ensureCommandContext();
      const sectionLocation = findSectionLocation(context.state, sectionId);
      if (!sectionLocation?.section) {
        throw new Error("section not found");
      }

      const basePartition = shared.storyBasePartitionFor(context.projectId);
      const scenePartition = sectionLocation.sceneId
        ? shared.storyScenePartitionFor(
            context.projectId,
            sectionLocation.sceneId,
          )
        : null;
      const partitions = scenePartition
        ? [basePartition, scenePartition]
        : [basePartition];

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
          partitions,
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
              partitions,
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
            partitions,
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
          payload: {
            lineId,
            data: {
              dialogue: structuredClone(desiredDialogue),
            },
            replace: false,
          },
          partitions,
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
      const basePartition = shared.storyBasePartitionFor(context.projectId);
      const scenePartition = shared.storyScenePartitionFor(
        context.projectId,
        finalSceneId,
      );
      const nextData = structuredClone(data || {});
      if (name !== undefined) {
        nextData.name = name;
      }

      const submitResult = await shared.submitCommandWithContext({
        context,
        scope: "story",
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
        partitions: [basePartition, scenePartition],
      });

      if (submitResult?.valid === false) {
        return submitResult;
      }

      return finalSceneId;
    },

    async updateSceneItem({ sceneId, data }) {
      const context = await shared.ensureCommandContext();
      const basePartition = shared.storyBasePartitionFor(context.projectId);
      const scenePartition = shared.storyScenePartitionFor(
        context.projectId,
        sceneId,
      );

      return shared.submitCommandWithContext({
        context,
        scope: "story",
        type: COMMAND_TYPES.SCENE_UPDATE,
        payload: {
          sceneId,
          data: structuredClone(data || {}),
        },
        partitions: [basePartition, scenePartition],
      });
    },

    async deleteSceneItem({ sceneIds }) {
      const context = await shared.ensureCommandContext();
      const basePartition = shared.storyBasePartitionFor(context.projectId);
      const scenePartitions = (sceneIds || []).map((id) =>
        shared.storyScenePartitionFor(context.projectId, id),
      );

      return shared.submitCommandWithContext({
        context,
        scope: "story",
        type: COMMAND_TYPES.SCENE_DELETE,
        payload: {
          sceneIds: structuredClone(sceneIds || []),
        },
        partitions: [basePartition, ...scenePartitions],
      });
    },

    async setInitialScene({ sceneId }) {
      const context = await shared.ensureCommandContext();
      const basePartition = shared.storyBasePartitionFor(context.projectId);
      const scenePartition = shared.storyScenePartitionFor(
        context.projectId,
        sceneId,
      );

      return shared.submitCommandWithContext({
        context,
        scope: "story",
        type: COMMAND_TYPES.STORY_UPDATE,
        payload: {
          data: {
            initialSceneId: sceneId,
          },
        },
        partitions: [basePartition, scenePartition],
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
      const basePartition = shared.storyBasePartitionFor(context.projectId);
      const scenePartition = shared.storyScenePartitionFor(
        context.projectId,
        sceneId,
      );

      return shared.submitCommandWithContext({
        context,
        scope: "story",
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
        partitions: [basePartition, scenePartition],
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
      const basePartition = shared.storyBasePartitionFor(context.projectId);
      const scenePartition = shared.storyScenePartitionFor(
        context.projectId,
        sceneId,
      );
      const nextData = structuredClone(data || {});
      if (name !== undefined) {
        nextData.name = name;
      }

      const submitResult = await shared.submitCommandWithContext({
        context,
        scope: "story",
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
        partitions: [basePartition, scenePartition],
      });

      if (submitResult?.valid === false) {
        return submitResult;
      }

      return nextSectionId;
    },

    async renameSectionItem({ sceneId, sectionId, name }) {
      const context = await shared.ensureCommandContext();
      const basePartition = shared.storyBasePartitionFor(context.projectId);
      const sectionLocation = findSectionLocation(context.state, sectionId);
      const sceneIdForPartition = sceneId || sectionLocation?.sceneId;
      const scenePartition = sceneIdForPartition
        ? shared.storyScenePartitionFor(context.projectId, sceneIdForPartition)
        : null;

      return shared.submitCommandWithContext({
        context,
        scope: "story",
        type: COMMAND_TYPES.SECTION_UPDATE,
        payload: {
          sectionId,
          data: {
            name,
          },
        },
        partitions: scenePartition
          ? [basePartition, scenePartition]
          : [basePartition],
      });
    },

    async deleteSectionItem({ sceneId, sectionIds }) {
      const context = await shared.ensureCommandContext();
      const basePartition = shared.storyBasePartitionFor(context.projectId);
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

      const scenePartitions = [...sceneIdsForPartitions].map((id) =>
        shared.storyScenePartitionFor(context.projectId, id),
      );

      return shared.submitCommandWithContext({
        context,
        scope: "story",
        type: COMMAND_TYPES.SECTION_DELETE,
        payload: {
          sectionIds: structuredClone(sectionIds || []),
        },
        partitions:
          scenePartitions.length > 0
            ? [basePartition, ...scenePartitions]
            : [basePartition],
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
      const basePartition = shared.storyBasePartitionFor(context.projectId);
      const scenePartition = sectionLocation?.sceneId
        ? shared.storyScenePartitionFor(
            context.projectId,
            sectionLocation.sceneId,
          )
        : null;

      return shared.submitCommandWithContext({
        context,
        scope: "story",
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
        partitions: scenePartition
          ? [basePartition, scenePartition]
          : [basePartition],
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
      const basePartition = shared.storyBasePartitionFor(context.projectId);
      const scenePartition = sectionLocation?.sceneId
        ? shared.storyScenePartitionFor(
            context.projectId,
            sectionLocation.sceneId,
          )
        : null;

      const submitResult = await shared.submitCommandWithContext({
        context,
        scope: "story",
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
        partitions: scenePartition
          ? [basePartition, scenePartition]
          : [basePartition],
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
      const context = await shared.ensureCommandContext();
      const basePartition = shared.storyBasePartitionFor(context.projectId);
      const sceneIdsForPartitions = new Set();

      for (const id of lineIds || []) {
        const lineLocation = findLineLocation(context.state, id);
        if (lineLocation?.sceneId) {
          sceneIdsForPartitions.add(lineLocation.sceneId);
        }
      }

      const scenePartitions = [...sceneIdsForPartitions].map((id) =>
        shared.storyScenePartitionFor(context.projectId, id),
      );

      return shared.submitCommandWithContext({
        context,
        scope: "story",
        type: COMMAND_TYPES.LINE_DELETE,
        payload: {
          lineIds: structuredClone(lineIds || []),
        },
        partitions:
          scenePartitions.length > 0
            ? [basePartition, ...scenePartitions]
            : [basePartition],
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
      const context = await shared.ensureCommandContext();
      const targetSection = findSectionLocation(context.state, toSectionId);
      const resolvedIndex = shared.resolveLineIndex({
        section: targetSection?.section,
        parentId,
        position,
        positionTargetId,
        index,
        movingId: lineId,
      });
      const basePartition = shared.storyBasePartitionFor(context.projectId);
      const sourceLine = findLineLocation(context.state, lineId);
      const sourceScenePartition = sourceLine?.sceneId
        ? shared.storyScenePartitionFor(context.projectId, sourceLine.sceneId)
        : null;
      const targetScenePartition = targetSection?.sceneId
        ? shared.storyScenePartitionFor(
            context.projectId,
            targetSection.sceneId,
          )
        : null;

      return shared.submitCommandWithContext({
        context,
        scope: "story",
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
        partitions: [basePartition, sourceScenePartition, targetScenePartition],
      });
    },
  };
};
