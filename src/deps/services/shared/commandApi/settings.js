import { COMMAND_TYPES } from "../../../../internal/project/commands.js";

export const createSettingsCommandApi = (shared) => ({
  async updateProjectFields({ patch }) {
    const context = await shared.ensureCommandContext();
    const keys = Object.keys(patch || {}).filter(
      (key) =>
        key && key !== "id" && key !== "createdAt" && key !== "updatedAt",
    );
    if (keys.length === 0) return;

    await shared.submitCommandWithContext({
      context,
      scope: "settings",
      type: COMMAND_TYPES.PROJECT_UPDATE,
      payload: {
        patch: structuredClone(patch),
      },
      partitions: [],
    });
  },
});
