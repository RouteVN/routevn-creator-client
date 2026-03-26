import { readDir, exists } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { convertFileSrc } from "@tauri-apps/api/core";
import { nanoid } from "nanoid";
import { createAppServiceCore } from "./shared/appServiceCore.js";

const deriveProjectNameFromPath = (projectPath) => {
  if (typeof projectPath !== "string" || projectPath.length === 0) {
    return "Untitled Project";
  }
  const normalizedPath = projectPath.replace(/[\\/]+$/, "");
  const segments = normalizedPath.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] || "Untitled Project";
};

export const createAppService = (params) => {
  const platformAdapter = {
    isDuplicateProjectEntry: ({ entries, entry }) => {
      return entries.some(
        (project) => project.projectPath === entry.projectPath,
      );
    },

    mapProjectEntryToProject: (entry) => ({
      projectPath: entry.projectPath,
    }),

    loadProjectIcon: async ({ entry }) => {
      const iconFileId = entry?.iconFileId;
      const projectPath = entry?.projectPath;
      if (!iconFileId || !projectPath) return null;

      try {
        const filePath = await join(projectPath, "files", iconFileId);
        const fileExists = await exists(filePath);
        if (!fileExists) return null;
        return convertFileSrc(filePath);
      } catch (error) {
        console.error("Failed to load project icon:", error);
        return null;
      }
    },

    validateProjectFolder: async (folderPath) => {
      try {
        const projectDbPath = await join(folderPath, "project.db");
        const projectDbExists = await exists(projectDbPath);

        const filesPath = await join(folderPath, "files");
        const filesExists = await exists(filesPath);

        if (!projectDbExists || !filesExists) {
          const missing = [];
          if (!projectDbExists) missing.push("project.db");
          if (!filesExists) missing.push("files folder");

          return {
            isValid: false,
            error: `Missing ${missing.join(" and ")}`,
          };
        }

        return { isValid: true };
      } catch (error) {
        return {
          isValid: false,
          error: error.message || error,
        };
      }
    },

    importProject: async (projectPath) => ({
      name: deriveProjectNameFromPath(projectPath),
      description: "",
      iconFileId: null,
    }),

    openExistingProject: async ({
      folderPath,
      addProjectEntry,
      loadProjectIcon,
      projectService,
    }) => {
      const validation =
        await platformAdapter.validateProjectFolder(folderPath);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      const projectData = await projectService.getProjectInfoByPath(folderPath);

      const projectEntry = {
        id: nanoid(),
        projectPath: folderPath,
        name: projectData.name,
        description: projectData.description,
        iconFileId: projectData.iconFileId || null,
        createdAt: Date.now(),
        lastOpenedAt: null,
      };

      await addProjectEntry(projectEntry);

      const fullProject = { ...projectEntry };
      if (projectData.iconFileId) {
        const iconUrl = await loadProjectIcon({
          entry: projectEntry,
          projectService,
        });
        if (iconUrl) {
          fullProject.iconUrl = iconUrl;
        }
      }

      return fullProject;
    },

    createNewProject: async ({
      name,
      description,
      projectPath,
      template,
      projectResolution,
      addProjectEntry,
      projectService,
    }) => {
      const entries = await readDir(projectPath);
      if (entries.length > 0) {
        throw new Error(
          "The selected folder must be empty. Please choose an empty folder for your new project.",
        );
      }

      const projectEntry = {
        id: nanoid(),
        projectPath,
        name,
        description,
        iconFileId: null,
        createdAt: Date.now(),
        lastOpenedAt: null,
      };

      await projectService.initializeProject({
        projectId: projectEntry.id,
        projectPath,
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

    selectFiles: async ({ options, multiple }) => {
      return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = options.accept || "*/*";
        input.multiple = multiple;
        input.style.display = "none";

        const cleanup = () => {
          if (document.body.contains(input)) {
            document.body.removeChild(input);
          }
        };

        input.onchange = (event) => {
          const files = Array.from(event.target.files || []);
          cleanup();
          resolve(files);
        };

        input.oncancel = () => {
          cleanup();
          resolve([]);
        };

        document.body.appendChild(input);
        input.click();
      });
    },
  };

  return createAppServiceCore({
    ...params,
    platformAdapter,
  });
};
