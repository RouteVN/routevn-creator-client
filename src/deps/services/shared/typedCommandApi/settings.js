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

  async updateVariableItem({ variableId, patch }) {
    const context = await shared.ensureTypedCommandContext();

    await shared.submitTypedCommandWithContext({
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
