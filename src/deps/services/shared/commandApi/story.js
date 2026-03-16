import {
  findLineLocation,
  findSectionLocation,
  normalizeParentId,
} from "../projectRepository.js";
import { COMMAND_TYPES } from "../../../../internal/project/commands.js";

export const createStoryCommandApi = (shared) => {
  const submitLineActionsData = async ({ lineId, data, replace = false }) => {
    const context = await shared.ensureCommandContext();
    const basePartition = shared.storyBasePartitionFor(context.projectId);
    const lineLocation = findLineLocation(context.state, lineId);
    const scenePartition = lineLocation?.sceneId
      ? shared.storyScenePartitionFor(context.projectId, lineLocation.sceneId)
      : null;

    await shared.submitCommandWithContext({
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
    async updateLineActions({ lineId, data, patch, replace = false }) {
      await submitLineActionsData({
        lineId,
        data: data ?? patch,
        replace,
      });
    },

    async updateLineAction({ lineId, actionType, action }) {
      if (typeof actionType !== "string" || actionType.length === 0) {
        throw new Error("actionType is required");
      }

      await submitLineActionsData({
        lineId,
        data: {
          [actionType]: structuredClone(action || {}),
        },
        replace: false,
      });
    },

    async updateLineDialogueAction({ lineId, dialogue }) {
      await submitLineActionsData({
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
        index,
      });
      const basePartition = shared.storyBasePartitionFor(context.projectId);
      const scenePartition = shared.storyScenePartitionFor(
        context.projectId,
        finalSceneId,
      );

      await shared.submitCommandWithContext({
        context,
        scope: "story",
        type: COMMAND_TYPES.SCENE_CREATE,
        payload: {
          sceneId: finalSceneId,
          parentId: normalizeParentId(parentId),
          index: resolvedIndex,
          position,
          data: {
            ...structuredClone(data || {}),
            ...(name !== undefined ? { name } : {}),
          },
        },
        partitions: [basePartition, scenePartition],
      });
      return finalSceneId;
    },

    async updateSceneItem({ sceneId, data, patch }) {
      const context = await shared.ensureCommandContext();
      const basePartition = shared.storyBasePartitionFor(context.projectId);
      const scenePartition = shared.storyScenePartitionFor(
        context.projectId,
        sceneId,
      );

      await shared.submitCommandWithContext({
        context,
        scope: "story",
        type: COMMAND_TYPES.SCENE_UPDATE,
        payload: {
          sceneId,
          data: structuredClone(data ?? patch ?? {}),
        },
        partitions: [basePartition, scenePartition],
      });
    },

    async deleteSceneItem({ sceneId }) {
      const context = await shared.ensureCommandContext();
      const basePartition = shared.storyBasePartitionFor(context.projectId);
      const scenePartition = shared.storyScenePartitionFor(
        context.projectId,
        sceneId,
      );

      await shared.submitCommandWithContext({
        context,
        scope: "story",
        type: COMMAND_TYPES.SCENE_DELETE,
        payload: {
          sceneId,
        },
        partitions: [basePartition, scenePartition],
      });
    },

    async setInitialScene({ sceneId }) {
      const context = await shared.ensureCommandContext();
      const basePartition = shared.storyBasePartitionFor(context.projectId);
      const scenePartition = shared.storyScenePartitionFor(
        context.projectId,
        sceneId,
      );

      await shared.submitCommandWithContext({
        context,
        scope: "story",
        type: COMMAND_TYPES.SCENE_SET_INITIAL,
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
      const context = await shared.ensureCommandContext();
      const resolvedIndex = shared.resolveSceneIndex({
        state: context.state,
        parentId,
        position,
        index,
        movingId: sceneId,
      });
      const basePartition = shared.storyBasePartitionFor(context.projectId);
      const scenePartition = shared.storyScenePartitionFor(
        context.projectId,
        sceneId,
      );

      await shared.submitCommandWithContext({
        context,
        scope: "story",
        type: COMMAND_TYPES.SCENE_MOVE,
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
      parentId = null,
      position = "last",
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
        index,
      });
      const basePartition = shared.storyBasePartitionFor(context.projectId);
      const scenePartition = shared.storyScenePartitionFor(
        context.projectId,
        sceneId,
      );

      await shared.submitCommandWithContext({
        context,
        scope: "story",
        type: COMMAND_TYPES.SECTION_CREATE,
        payload: {
          sceneId,
          sectionId: nextSectionId,
          parentId: normalizeParentId(parentId),
          index: resolvedIndex,
          position,
          data: {
            ...structuredClone(data || {}),
            ...(name !== undefined ? { name } : {}),
          },
        },
        partitions: [basePartition, scenePartition],
      });

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

      await shared.submitCommandWithContext({
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

    async deleteSectionItem({ sceneId, sectionId }) {
      const context = await shared.ensureCommandContext();
      const basePartition = shared.storyBasePartitionFor(context.projectId);
      const sectionLocation = findSectionLocation(context.state, sectionId);
      const sceneIdForPartition = sceneId || sectionLocation?.sceneId;
      const scenePartition = sceneIdForPartition
        ? shared.storyScenePartitionFor(context.projectId, sceneIdForPartition)
        : null;

      await shared.submitCommandWithContext({
        context,
        scope: "story",
        type: COMMAND_TYPES.SECTION_DELETE,
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
      const context = await shared.ensureCommandContext();
      const sectionLocation = findSectionLocation(context.state, sectionId);
      const resolvedIndex = shared.resolveSectionIndex({
        scene: sectionLocation?.scene,
        parentId,
        position,
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

      await shared.submitCommandWithContext({
        context,
        scope: "story",
        type: COMMAND_TYPES.SECTION_MOVE,
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
      data = {},
      line,
      afterLineId,
      beforeLineId,
      parentId = null,
      position,
      index,
    }) {
      const context = await shared.ensureCommandContext();
      const nextLineId = lineId || shared.createId();
      const sectionLocation = findSectionLocation(context.state, sectionId);
      let resolvedPosition = position;
      if (resolvedPosition === undefined && beforeLineId) {
        resolvedPosition = { before: beforeLineId };
      } else if (resolvedPosition === undefined && afterLineId) {
        resolvedPosition = { after: afterLineId };
      }
      const resolvedIndex = shared.resolveLineIndex({
        section: sectionLocation?.section,
        parentId,
        position: resolvedPosition || "last",
        index,
      });
      const basePartition = shared.storyBasePartitionFor(context.projectId);
      const scenePartition = sectionLocation?.sceneId
        ? shared.storyScenePartitionFor(
            context.projectId,
            sectionLocation.sceneId,
          )
        : null;

      await shared.submitCommandWithContext({
        context,
        scope: "story",
        type: COMMAND_TYPES.LINE_CREATE,
        payload: {
          sectionId,
          lineId: nextLineId,
          data: structuredClone(data ?? line ?? {}),
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

    async deleteLineItem({ lineId }) {
      const context = await shared.ensureCommandContext();
      const basePartition = shared.storyBasePartitionFor(context.projectId);
      const lineLocation = findLineLocation(context.state, lineId);
      const scenePartition = lineLocation?.sceneId
        ? shared.storyScenePartitionFor(context.projectId, lineLocation.sceneId)
        : null;

      await shared.submitCommandWithContext({
        context,
        scope: "story",
        type: COMMAND_TYPES.LINE_DELETE,
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
      const context = await shared.ensureCommandContext();
      const targetSection = findSectionLocation(context.state, toSectionId);
      const resolvedIndex = shared.resolveLineIndex({
        section: targetSection?.section,
        parentId,
        position,
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

      await shared.submitCommandWithContext({
        context,
        scope: "story",
        type: COMMAND_TYPES.LINE_MOVE,
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
  };
};
