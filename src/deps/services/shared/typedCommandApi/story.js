import {
  findLineLocation,
  findSectionLocation,
  normalizeParentId,
} from "../typedProjectRepository.js";

export const createStoryCommandApi = (shared) => ({
  async createSceneItem({
    sceneId,
    name,
    parentId = null,
    position = "last",
    index,
    data = {},
  }) {
    const context = await shared.ensureTypedCommandContext();
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

    await shared.submitTypedCommandWithContext({
      context,
      scope: "story",
      type: "scene.create",
      payload: {
        sceneId: finalSceneId,
        name,
        parentId: normalizeParentId(parentId),
        index: resolvedIndex,
        position,
        data: structuredClone(data || {}),
      },
      partitions: [basePartition, scenePartition],
    });
    return finalSceneId;
  },

  async updateSceneItem({ sceneId, patch }) {
    const context = await shared.ensureTypedCommandContext();
    const basePartition = shared.storyBasePartitionFor(context.projectId);
    const scenePartition = shared.storyScenePartitionFor(
      context.projectId,
      sceneId,
    );

    await shared.submitTypedCommandWithContext({
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
    const context = await shared.ensureTypedCommandContext();
    const basePartition = shared.storyBasePartitionFor(context.projectId);
    const scenePartition = shared.storyScenePartitionFor(
      context.projectId,
      sceneId,
    );

    await shared.submitTypedCommandWithContext({
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
    const context = await shared.ensureTypedCommandContext();
    const basePartition = shared.storyBasePartitionFor(context.projectId);
    const scenePartition = shared.storyScenePartitionFor(
      context.projectId,
      sceneId,
    );

    await shared.submitTypedCommandWithContext({
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
    const context = await shared.ensureTypedCommandContext();
    const basePartition = shared.storyBasePartitionFor(context.projectId);
    const scenePartition = shared.storyScenePartitionFor(
      context.projectId,
      sceneId,
    );

    await shared.submitTypedCommandWithContext({
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
    const context = await shared.ensureTypedCommandContext();
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

    await shared.submitTypedCommandWithContext({
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
    const context = await shared.ensureTypedCommandContext();
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

    await shared.submitTypedCommandWithContext({
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

  async renameSectionItem({ sceneId, sectionId, name }) {
    const context = await shared.ensureTypedCommandContext();
    const basePartition = shared.storyBasePartitionFor(context.projectId);
    const sectionLocation = findSectionLocation(context.state, sectionId);
    const sceneIdForPartition = sceneId || sectionLocation?.sceneId;
    const scenePartition = sceneIdForPartition
      ? shared.storyScenePartitionFor(context.projectId, sceneIdForPartition)
      : null;

    await shared.submitTypedCommandWithContext({
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

  async deleteSectionItem({ sceneId, sectionId }) {
    const context = await shared.ensureTypedCommandContext();
    const basePartition = shared.storyBasePartitionFor(context.projectId);
    const sectionLocation = findSectionLocation(context.state, sectionId);
    const sceneIdForPartition = sceneId || sectionLocation?.sceneId;
    const scenePartition = sceneIdForPartition
      ? shared.storyScenePartitionFor(context.projectId, sceneIdForPartition)
      : null;

    await shared.submitTypedCommandWithContext({
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
    const context = await shared.ensureTypedCommandContext();
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

    await shared.submitTypedCommandWithContext({
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
    const context = await shared.ensureTypedCommandContext();
    const nextLineId = lineId || shared.createId();
    const sectionLocation = findSectionLocation(context.state, sectionId);
    const resolvedPosition =
      position || (afterLineId ? { after: afterLineId } : undefined);
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

    await shared.submitTypedCommandWithContext({
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
    const context = await shared.ensureTypedCommandContext();
    const basePartition = shared.storyBasePartitionFor(context.projectId);
    const lineLocation = findLineLocation(context.state, lineId);
    const scenePartition = lineLocation?.sceneId
      ? shared.storyScenePartitionFor(context.projectId, lineLocation.sceneId)
      : null;

    await shared.submitTypedCommandWithContext({
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
    const context = await shared.ensureTypedCommandContext();
    const basePartition = shared.storyBasePartitionFor(context.projectId);
    const lineLocation = findLineLocation(context.state, lineId);
    const scenePartition = lineLocation?.sceneId
      ? shared.storyScenePartitionFor(context.projectId, lineLocation.sceneId)
      : null;

    await shared.submitTypedCommandWithContext({
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
    const context = await shared.ensureTypedCommandContext();
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
      ? shared.storyScenePartitionFor(context.projectId, targetSection.sceneId)
      : null;

    await shared.submitTypedCommandWithContext({
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
});
