import { createAppServiceCore } from "../shared/appServiceCore.js";
import { callAndroidBridge } from "../../clients/android/bridge.js";
import { generateId } from "../../../internal/id.js";
import { copyTextToClipboard } from "../../../internal/copyText.js";

const ANDROID_PROJECT_ROOT_LABEL = "Android app storage/projects";

const normalizeAndroidProjectFolderName = (name) => {
  const folderName = String(name ?? "")
    .trim()
    .replace(/[\\/:*?"<>|\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!folderName) {
    throw new Error("Project Name is required.");
  }

  return folderName.length > 120 ? folderName.slice(0, 120).trim() : folderName;
};

const createAndroidProjectPath = (folderName) => {
  return folderName ? `${ANDROID_PROJECT_ROOT_LABEL}/${folderName}` : "";
};

const normalizeFolderSelection = (selection) => {
  if (typeof selection === "string") {
    return {
      uri: selection,
      name: "",
    };
  }

  return {
    uri: selection?.uri ?? "",
    name: selection?.name ?? "",
  };
};

export const createAppService = (params) => {
  const appDb = params.db;

  const ensureAndroidProjectPathAvailable = async ({
    projectPath,
    projectId,
  }) => {
    const entries = (await appDb.get("projectEntries")) || [];
    if (!Array.isArray(entries)) {
      return;
    }

    const duplicateEntry = entries.find((entry) => {
      return (
        entry?.projectPath === projectPath &&
        (!projectId || entry?.id !== projectId)
      );
    });
    if (duplicateEntry) {
      throw new Error(
        "A project folder with this name already exists. Change the project title and try again.",
      );
    }
  };

  const platformAdapter = {
    isDuplicateProjectEntry: ({ entries, entry }) => {
      return entries.some((project) => {
        if (project.id === entry.id) {
          return true;
        }

        return Boolean(
          entry.projectPath && project.projectPath === entry.projectPath,
        );
      });
    },

    mapProjectEntryToProject: (entry) => ({
      projectPath: entry.projectPath ?? createAndroidProjectPath(entry.id),
    }),

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
      return { isValid: false, error: "Not supported on Android." };
    },

    importProject: async () => {
      throw new Error("Use openExistingProject to import Android projects.");
    },

    openExistingProject: async ({
      folderPath,
      addProjectEntry,
      loadProjectIcon,
      projectService,
    }) => {
      const folderSelection = normalizeFolderSelection(folderPath);
      if (!folderSelection.uri) {
        throw new Error("Project folder is required.");
      }

      const importedProject = callAndroidBridge("importProjectFolder", {
        uri: folderSelection.uri,
      });
      const projectId = importedProject.id;
      if (!projectId) {
        throw new Error("Imported project is missing an id.");
      }

      const importedName = importedProject.name?.trim?.() ?? "";
      let projectName = "Untitled Project";
      if (importedName) {
        projectName = importedName;
      }
      const projectFolderName = normalizeAndroidProjectFolderName(projectName);
      const projectPath = createAndroidProjectPath(projectFolderName);
      await ensureAndroidProjectPathAvailable({ projectPath, projectId });

      const projectEntry = {
        id: projectId,
        projectPath,
        name: projectName,
        description: importedProject.description ?? "",
        iconFileId: importedProject.iconFileId ?? null,
        createdAt: Date.now(),
        lastOpenedAt: null,
      };

      await addProjectEntry(projectEntry);

      const fullProject = { ...projectEntry };
      if (projectEntry.iconFileId) {
        const iconResult = await loadProjectIcon({
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

    createNewProject: async ({
      name,
      description,
      template,
      projectResolution,
      iconFile,
      addProjectEntry,
      projectService,
    }) => {
      const projectId = generateId();
      const namespace = generateId();
      const projectFolderName = normalizeAndroidProjectFolderName(name);
      const projectPath = createAndroidProjectPath(projectFolderName);
      await ensureAndroidProjectPathAvailable({ projectPath });

      let iconFileId = null;
      if (iconFile) {
        const storedIcon = await projectService.storeFileForProject({
          projectId,
          file: iconFile,
        });
        iconFileId = storedIcon.fileId;
      }

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
        projectId: projectEntry.id,
        template,
        projectResolution,
        projectInfo: {
          id: projectId,
          namespace,
          name,
          description,
          iconFileId,
        },
      });

      await addProjectEntry(projectEntry);
      const fullProject = { ...projectEntry };
      if (iconFileId) {
        const iconResult = await platformAdapter.loadProjectIcon({
          entry: projectEntry,
          projectService,
        });
        if (iconResult?.url) {
          fullProject.iconUrl = iconResult.url;
        }
      }

      return fullProject;
    },

    selectFiles: ({ options, multiple, filePicker }) => {
      return filePicker.openFilePicker({
        ...options,
        multiple,
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

    async startStaticWebServer() {
      throw new Error(
        "Static web server is only available in the desktop app.",
      );
    },

    async stopStaticWebServer() {
      return false;
    },

    async listStaticWebServers() {
      return [];
    },
  };
};
