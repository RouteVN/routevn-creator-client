import { normalizeParentId } from "../typedProjectRepository.js";

export const createSettingsCommandApi = (shared) => ({
  async updateProjectFields({ patch }) {
    const context = await shared.ensureTypedCommandContext();
    const keys = Object.keys(patch || {}).filter(
      (key) =>
        key && key !== "id" && key !== "createdAt" && key !== "updatedAt",
    );
    if (keys.length === 0) return;

    await shared.submitTypedCommandWithContext({
      context,
      scope: "settings",
      type: "project.update",
      payload: {
        patch: structuredClone(patch),
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
    const context = await shared.ensureTypedCommandContext();
    const nextVariableId = variableId || shared.createId();

    await shared.submitTypedCommandWithContext({
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

  async updateVariableItem({
    variableId,
    patch = {},
    parentId,
    position,
    index,
  }) {
    const context = await shared.ensureTypedCommandContext();
    const nextPatch = structuredClone(patch ?? {});
    const hasParentChange = Object.prototype.hasOwnProperty.call(
      nextPatch,
      "parentId",
    );
    if (hasParentChange) {
      nextPatch.parentId = normalizeParentId(nextPatch.parentId);
    }
    const resolvedParentId = hasParentChange
      ? nextPatch.parentId
      : normalizeParentId(parentId);
    const resolvedIndex =
      hasParentChange ||
      parentId !== undefined ||
      Number.isInteger(index) ||
      position !== undefined
        ? shared.resolveVariableIndex({
            state: context.state,
            parentId: resolvedParentId,
            position,
            index,
            movingId: variableId,
          })
        : undefined;

    await shared.submitTypedCommandWithContext({
      context,
      scope: "settings",
      type: "variable.update",
      payload: {
        variableId,
        patch: nextPatch,
        ...(resolvedIndex !== undefined ? { index: resolvedIndex } : {}),
        ...(position !== undefined ? { position } : {}),
      },
      partitions: [],
    });
  },

  async deleteVariableItem({ variableId }) {
    const context = await shared.ensureTypedCommandContext();

    await shared.submitTypedCommandWithContext({
      context,
      scope: "settings",
      type: "variable.delete",
      payload: {
        variableId,
      },
      partitions: [],
    });
  },
});
