import { readDir, exists } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { createAppServiceCore } from "./shared/appServiceCore.js";
import { generateId } from "../../internal/id.js";
import { assertSafeProjectFileId } from "../../internal/projectFileIds.js";
import { copyTextToClipboard } from "../../internal/copyText.js";
import { createNativeApplicationIdentifier } from "../../internal/nativeApplicationIdentifier.js";
import { normalizeProjectLanguage } from "../../internal/projectLanguage.js";
import { setDiscordPresenceDetails as setDiscordPresenceDetailsClient } from "../clients/tauri/discordPresence.js";
import { createTauriProjectImportHost } from "../clients/tauri/projectImportHost.js";
import { createProjectImportService } from "./shared/projectImportService.js";
import { createProjectFolderNotEmptyError } from "../../internal/projectInitialization.js";

// The folder name, or empty when the path has none. The projects page shows
// its localized "Untitled" label for a project without a name.
const deriveProjectNameFromPath = (projectPath) => {
  if (typeof projectPath !== "string" || projectPath.length === 0) {
    return "";
  }
  const normalizedPath = projectPath.replace(/[\\/]+$/, "");
  const segments = normalizedPath.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) ?? "";
};

const isFolderEmpty = async (folderPath) =>
  (await readDir(folderPath)).length === 0;

const runningStaticWebServersById = new Map();

const cloneRunningStaticWebServers = () => {
  return Array.from(runningStaticWebServersById.values()).map((server) => ({
    ...server,
  }));
};

export const createAppService = (params) => {
  const projectImportHost = createTauriProjectImportHost();
  const projectImport = createProjectImportService({
    host: projectImportHost,
  });

  // Rule A for a project folder on disk: the files directly inside `files/`
  // are renamed in place so each is stored under its file id.
  const normalizeProjectFileNames = async (folderPath) => {
    const renames = await projectImport.planFolderFileRenames({
      list: projectImportHost.createFolderLister(folderPath),
    });
    if (renames.length === 0) {
      return;
    }
    await projectImportHost.applyFileRenames({
      directory: await join(folderPath, "files"),
      renames,
    });
  };

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

      // Local folder imports normalize file ids in place (extension
      // stripping), but only once the folder is known to be a project, so a
      // wrong folder is never touched.
      await normalizeProjectFileNames(folderPath);

      const projectEntry = {
        id: projectId,
        projectPath: folderPath,
        name: projectData.name,
        description: projectData.description,
        language: normalizeProjectLanguage(projectData.language),
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
      language,
      projectPath,
      template,
      projectResolution,
      iconFile,
      addProjectEntry,
      projectService,
    }) => {
      const entries = await readDir(projectPath);
      if (entries.length > 0) {
        throw createProjectFolderNotEmptyError();
      }

      let iconFileId = null;
      const projectId = generateId();
      const namespace = generateId();
      const nativeApplicationIdentifier = createNativeApplicationIdentifier();
      const projectEntry = {
        id: projectId,
        projectPath,
        name,
        description,
        language,
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
          nativeApplicationIdentifier,
          name,
          description,
          language,
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

  // Zip and URL imports save the project directly in the chosen folder, so,
  // as for a new project, it must be set and empty. The dialogs check this
  // first; this guards the import itself.
  const assertImportDestination = async (destinationFolder) => {
    if (!destinationFolder) {
      throw new Error("importFailed: Destination folder is required.");
    }
    if (!(await isFolderEmpty(destinationFolder))) {
      throw new Error("importFailed: The destination folder is not empty.");
    }
  };

  // The last step of a zip or URL import: move the extracted project out of
  // staging into the destination folder itself, then register it there.
  const registerImportedFolder = async ({ staging, path, projectPath }) => {
    const registeredPaths = new Set(
      (await appService.getProjectEntries()).map((entry) => entry.projectPath),
    );
    await projectImportHost.moveIntoEmptyFolder({
      staging,
      path,
      folder: projectPath,
    });
    try {
      return await appService.openExistingProject(projectPath);
    } catch (error) {
      await discardImportedFolder({ projectPath, staging, registeredPaths });
      throw error;
    }
  };

  // Undoes a zip or URL import whose folder could not be registered. The project's
  // database connection and cached stores are released before the folder is
  // emptied, so a later import into the same folder opens its own database.
  // The entry is removed only if this import added it: an entry that already
  // had this path pointed at a folder that no longer held its project and is
  // left as it was. Each step is attempted even if an earlier one failed, so
  // the folder is still emptied when releasing or unlisting it did not work.
  const discardImportedFolder = async ({
    projectPath,
    staging,
    registeredPaths,
  }) => {
    try {
      await params.projectService.releaseRepositoryByPath(projectPath);
    } catch (releaseError) {
      console.error("Failed to release the imported project:", releaseError);
    }
    if (!registeredPaths.has(projectPath)) {
      try {
        await appService.removeProjectEntryByPath(projectPath);
      } catch (entryError) {
        console.error("Failed to unlist the imported project:", entryError);
      }
    }
    try {
      await projectImportHost.emptyFolder({ folder: projectPath, staging });
    } catch (removeError) {
      console.error(
        "Failed to empty the import destination folder:",
        removeError,
      );
    }
  };

  return {
    ...appService,

    // Through the UI client, so background alerts wait for it to close.
    showProgressDialog(options) {
      return params.globalUI.showProgressDialog(options);
    },

    copyText(value) {
      return copyTextToClipboard(value);
    },

    setDiscordPresenceDetails(options) {
      return setDiscordPresenceDetailsClient(options);
    },

    // A zip file on this computer. Resolves to `{ uri, name }`, where `uri` is
    // the file's path, or undefined when the picker is cancelled.
    // `fileTypeName` labels the zip filter in the system dialog.
    async openArchivePicker({ title, fileTypeName = "Zip" } = {}) {
      const path = await appService.openFilePicker({
        title,
        filters: [{ name: fileTypeName, extensions: ["zip"] }],
      });
      if (!path) {
        return undefined;
      }
      return { uri: path, name: path.split(/[\\/]/).at(-1) };
    },

    // Whether a folder picked as a zip or URL import destination is empty.
    isFolderEmpty,

    // Zip and URL import on desktop: the destination is an empty folder, as
    // for a new project. The archive is copied or downloaded into a temporary
    // staging folder inside it and extracted, and the project's files are
    // moved out of staging into the folder itself. The folder is registered in
    // place, and emptied again if registering fails.
    async importProjectFromArchive({
      uri,
      destinationFolder,
      onProgress,
    } = {}) {
      if (!uri) {
        throw new Error("importFailed: Archive path is required.");
      }
      await assertImportDestination(destinationFolder);

      return projectImport.importFromArchive({
        uri,
        parent: destinationFolder,
        onProgress,
        finish: ({ staging, path }) =>
          registerImportedFolder({
            staging,
            path,
            projectPath: destinationFolder,
          }),
      });
    },

    async importProjectFromUrl({ url, destinationFolder, onProgress } = {}) {
      await assertImportDestination(destinationFolder);

      return projectImport.importFromUrl({
        url,
        parent: destinationFolder,
        onProgress,
        finish: ({ staging, path }) =>
          registerImportedFolder({
            staging,
            path,
            projectPath: destinationFolder,
          }),
      });
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

    async getLinuxAppImageDesktopIntegrationStatus() {
      try {
        return await invoke("get_linux_appimage_desktop_integration_status");
      } catch (error) {
        const message = String(error?.message ?? error ?? "");
        if (
          message.includes(
            "Command get_linux_appimage_desktop_integration_status not found",
          )
        ) {
          return {
            available: false,
            integrated: false,
          };
        }

        throw error;
      }
    },

    async installLinuxAppImageDesktopIntegration() {
      return invoke("install_linux_appimage_desktop_integration");
    },

    async restartLinuxAppImageFromDesktopIntegration() {
      return invoke("restart_linux_appimage_from_desktop_integration");
    },
  };
};
