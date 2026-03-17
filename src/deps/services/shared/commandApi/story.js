import { findLineLocation, findSectionLocation } from "../projectRepository.js";
import { COMMAND_TYPES } from "../../../../internal/project/commands.js";

export const createStoryCommandApi = (shared) => {
  const submitLineActionsData = async ({ lineId, data, replace = false }) => {
    const context = await shared.ensureCommandContext();
    const basePartition = shared.storyBasePartitionFor(context.projectId);
    const lineLocation = findLineLocation(context.state, lineId);
    const scenePartition = lineLocation?.sceneId
      ? shared.storyScenePartitionFor(context.projectId, lineLocation.sceneId)
      : null;

    return shared.submitCommandWithContext({
      context,
      scope: "story",
      type: COMMAND_TYPES.LINE_UPDATE_ACTIONS,
      payload: {
        lineId,
        data: structuredClone(data || {}),
        replace: replace === true,
      },
      partitions: scenePartition
        ? [basePartition, scenePartition]
        : [basePartition],
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
          ...shared.buildPlacementPayload({
            parentId,
            index: resolvedIndex,
            position: position || "last",
            positionTargetId,
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
          ...shared.buildPlacementPayload({
            parentId,
            index: resolvedIndex,
            position,
            positionTargetId,
          }),
        },
        partitions: [basePartition, sourceScenePartition, targetScenePartition],
      });
    },
  };
};
