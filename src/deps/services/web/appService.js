import { nanoid } from "nanoid";
import { createAppServiceCore } from "../shared/appServiceCore.js";

export const createAppService = (params) => {
  const platformAdapter = {
    isDuplicateProjectEntry: ({ entries, entry }) => {
      return entries.some((project) => project.id === entry.id);
    },

    loadProjectIcon: async ({ entry, projectService }) => {
      if (!entry?.iconFileId) return null;

      try {
        const blob = await projectService.getFileByProjectId(
          entry.id,
          entry.iconFileId,
        );
        if (!blob) {
          return null;
        }
        const url = URL.createObjectURL(blob);
        return {
          url,
          cleanup: () => URL.revokeObjectURL(url),
        };
      } catch (error) {
        console.error("Failed to load project icon:", error);
        return null;
      }
    },

    validateProjectFolder: async () => {
      return { isValid: false, error: "Not supported on web." };
    },

    importProject: async () => {
      throw new Error("Importing projects is not supported on the web.");
    },

    openExistingProject: async () => {
      throw new Error("Opening existing projects is not supported on the web.");
    },

    createNewProject: async ({
      name,
      description,
      template,
      projectResolution,
      addProjectEntry,
      projectService,
    }) => {
      const projectEntry = {
        id: nanoid(),
        name,
        description,
        iconFileId: null,
        createdAt: Date.now(),
        lastOpenedAt: null,
      };

      await projectService.initializeProject({
        projectId: projectEntry.id,
        template,
        projectResolution,
        projectInfo: {
          name,
          description,
          iconFileId: null,
        },
      });

      await addProjectEntry(projectEntry);
      return { ...projectEntry };
    },

    selectFiles: ({ options, multiple, filePicker }) => {
      return filePicker.openFilePicker({
        ...options,
        multiple,
      });
    },
  };

  return createAppServiceCore({
    ...params,
    platformAdapter,
  });
};
