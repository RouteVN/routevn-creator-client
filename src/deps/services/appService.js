import { readDir, exists } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { createAppServiceCore } from "./shared/appServiceCore.js";
import { generateId } from "../../internal/id.js";
import { assertSafeProjectFileId } from "../../internal/projectFileIds.js";
import { copyTextToClipboard } from "../../internal/copyText.js";

const deriveProjectNameFromPath = (projectPath) => {
  if (typeof projectPath !== "string" || projectPath.length === 0) {
    return "Untitled Project";
  }
  const normalizedPath = projectPath.replace(/[\\/]+$/, "");
  const segments = normalizedPath.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] || "Untitled Project";
};

const runningStaticWebServersById = new Map();

const cloneRunningStaticWebServers = () => {
  return Array.from(runningStaticWebServersById.values()).map((server) => ({
    ...server,
  }));
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
        const safeIconFileId = assertSafeProjectFileId(iconFileId, {
          label: "Project icon file id",
        });
        const filePath = await join(projectPath, "files", safeIconFileId);
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
      const projectId = projectData.id;

      const projectEntry = {
        id: projectId,
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
      iconFile,
      addProjectEntry,
      projectService,
    }) => {
      const entries = await readDir(projectPath);
      if (entries.length > 0) {
        throw new Error(
          "The selected folder must be empty. Please choose an empty folder for your new project.",
        );
      }

      let iconFileId = null;
      const projectId = generateId();
      const namespace = generateId();
      const projectEntry = {
        id: projectId,
        projectPath,
        name,
        description,
        iconFileId,
        createdAt: Date.now(),
        lastOpenedAt: null,
      };

      await projectService.initializeProject({
        projectId,
        projectPath,
        template,
        projectResolution,
        projectInfo: {
          id: projectId,
          namespace,
          name,
          description,
          iconFileId: null,
        },
      });

      if (iconFile) {
        const storedIcon = await projectService.storeFileForProject({
          projectId,
          projectPath,
          file: iconFile,
        });
        iconFileId = storedIcon.fileId;
        projectEntry.iconFileId = iconFileId;
        await projectService.updateProjectInfoByPath(projectPath, {
          iconFileId,
        });
      }

      await addProjectEntry(projectEntry);
      const fullProject = { ...projectEntry };
      if (iconFileId) {
        const iconResult = await platformAdapter.loadProjectIcon({
          entry: projectEntry,
          projectService,
        });
        if (typeof iconResult === "string") {
          fullProject.iconUrl = iconResult;
        } else if (iconResult?.url) {
          fullProject.iconUrl = iconResult.url;
        }
      }

      return fullProject;
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

  const appService = createAppServiceCore({
    ...params,
    platformAdapter,
  });

  return {
    ...appService,

    copyText(value) {
      return copyTextToClipboard(value);
    },

    async startStaticWebServer({ rootPath } = {}) {
      if (!rootPath) {
        throw new Error("rootPath is required");
      }

      const server = await invoke("start_static_web_server", {
        rootPath,
      });
      if (server?.serverId) {
        runningStaticWebServersById.set(server.serverId, server);
      }
      return server;
    },

    async stopStaticWebServer({ serverId } = {}) {
      if (!serverId) {
        return false;
      }

      const result = await invoke("stop_static_web_server", {
        serverId,
      });
      if (result) {
        runningStaticWebServersById.delete(serverId);
      }
      return result;
    },

    async listStaticWebServers() {
      try {
        const servers = await invoke("list_static_web_servers");
        runningStaticWebServersById.clear();
        for (const server of Array.isArray(servers) ? servers : []) {
          if (server?.serverId) {
            runningStaticWebServersById.set(server.serverId, server);
          }
        }
        return cloneRunningStaticWebServers();
      } catch (error) {
        const message = String(error?.message ?? error ?? "");
        if (message.includes("Command list_static_web_servers not found")) {
          console.warn(
            "list_static_web_servers is unavailable in the running Tauri binary. Falling back to the local cache.",
          );
          return cloneRunningStaticWebServers();
        }

        throw error;
      }
    },
  };
};
