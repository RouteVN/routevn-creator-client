import { createAppServiceCore } from "../shared/appServiceCore.js";
import { callIOSBridge } from "../../clients/ios/bridge.js";
import { getIOSProjectFileUrl } from "./projectFileUrls.js";
import { generateId } from "../../../internal/id.js";
import { copyTextToClipboard } from "../../../internal/copyText.js";
import { createNativeApplicationIdentifier } from "../../../internal/nativeApplicationIdentifier.js";
import { normalizeProjectLanguage } from "../../../internal/projectLanguage.js";
import { isDarkTheme } from "../../../internal/theme.js";
import { createProgressDialog } from "../../clients/progressDialog.js";
import { createIOSProjectFolderSetup } from "../../clients/ios/projectFolderSetup.js";

const formatFileDisplayPath = (filePath, deviceName) => {
  if (!filePath) return undefined;

  // Native exports return URLs; project listings already contain decoded paths.
  // Decode only URLs, once, so literal percent sequences in names survive.
  if (filePath.startsWith("file://")) {
    filePath = decodeURIComponent(new URL(filePath).pathname);
  }

  const roots = [
    ["/File Provider Storage/", `On My ${deviceName}`],
    ["/Mobile Documents/com~apple~CloudDocs/", "iCloud Drive"],
  ];
  for (const [marker, label] of roots) {
    const index = filePath.indexOf(marker);
    if (index !== -1) {
      const relativePath = filePath.slice(index + marker.length);
      return `${label} / ${relativePath.split("/").join(" / ")}`;
    }
  }

  return filePath.split("/").slice(-2).join(" / ");
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

const toIOSProjectEntry = ({ project, existingEntry } = {}) => {
  const projectId = project?.id ?? "";
  if (!projectId) {
    return undefined;
  }

  const projectName = project.name?.trim?.() || existingEntry?.name;

  return {
    id: projectId,
    projectFilePath: project.projectFilePath,
    name: projectName || "Untitled Project",
    description: project.description ?? existingEntry?.description ?? "",
    language: normalizeProjectLanguage(
      project.language ?? existingEntry?.language,
    ),
    iconFileId: project.iconFileId ?? null,
    createdAt: existingEntry?.createdAt ?? Date.now(),
    lastOpenedAt: existingEntry?.lastOpenedAt ?? null,
  };
};

export const createAppService = (params) => {
  const appDb = params.db;
  const projectFolderSetup = createIOSProjectFolderSetup({
    filePicker: params.filePicker,
  });
  const getFileDisplayPath = (filePath) =>
    formatFileDisplayPath(
      filePath,
      projectFolderSetup.getStatus().deviceName ?? "iPhone",
    );

  const syncIOSProjectEntriesFromStorage = async () => {
    const discoveredProjects = await callIOSBridge("listProjectFolders");

    const entries = (await appDb.get("projectEntries")) ?? [];
    const existingEntries = Array.isArray(entries) ? entries : [];
    const existingEntriesById = new Map(
      existingEntries
        .filter((entry) => entry?.id)
        .map((entry) => [entry.id, entry]),
    );

    const nextEntries = [];
    for (const project of discoveredProjects) {
      const entry = toIOSProjectEntry({
        project,
        existingEntry: existingEntriesById.get(project?.id),
      });
      if (entry) {
        nextEntries.push(entry);
      }
    }

    await appDb.set("projectEntries", nextEntries);
  };

  const platformAdapter = {
    getFileDisplayPath,

    applyTheme: (theme) => {
      callIOSBridge("setStatusBarStyle", {
        style: isDarkTheme(theme) ? "light" : "dark",
      }).catch(() => {
        const copy = appService.getAppCopy();
        appService.showToast({
          title: copy.errorTitle ?? "Error",
          message:
            copy.failedUpdateStatusBar ??
            "Could not update the status bar. Please restart the app.",
          status: "error",
        });
      });
    },

    isDuplicateProjectEntry: ({ entries, entry }) => {
      return entries.some((project) => project.id === entry.id);
    },

    mapProjectEntryToProject: (entry) => ({
      projectFilePath: entry.projectFilePath,
      projectFileDisplayPath: getFileDisplayPath(entry.projectFilePath),
    }),

    loadProjectIcon: async ({ entry }) => {
      if (!entry?.id || !entry?.iconFileId) return null;

      try {
        return getIOSProjectFileUrl({
          projectId: entry.id,
          fileId: entry.iconFileId,
        });
      } catch (error) {
        console.error("Failed to load project icon:", error);
        return null;
      }
    },

    validateProjectFolder: async () => {
      return { isValid: false, error: "Not supported on iOS." };
    },

    importProject: async () => {
      throw new Error("Use openExistingProject to import iOS projects.");
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

      const importedProject = await callIOSBridge("importProjectFolder", {
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

      const projectEntry = {
        id: projectId,
        projectFilePath: importedProject.projectFilePath,
        name: projectName,
        description: importedProject.description ?? "",
        language: normalizeProjectLanguage(importedProject.language),
        iconFileId: importedProject.iconFileId ?? null,
        createdAt: Date.now(),
        lastOpenedAt: null,
      };

      await addProjectEntry(projectEntry);

      const fullProject = {
        ...projectEntry,
        projectFileDisplayPath: getFileDisplayPath(
          projectEntry.projectFilePath,
        ),
      };
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
      language,
      template,
      projectResolution,
      iconFile,
      addProjectEntry,
      projectService,
    }) => {
      const projectId = generateId();
      const namespace = generateId();
      const nativeApplicationIdentifier = createNativeApplicationIdentifier();

      let iconFileId = null;

      const projectEntry = {
        id: projectId,
        name,
        description,
        language,
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
          nativeApplicationIdentifier,
          name,
          description,
          language,
          iconFileId: null,
        },
      });

      const storageStatus = await callIOSBridge("getProjectStorageStatus", {
        projectId,
      });
      projectEntry.projectFilePath = storageStatus.projectFilePath;
      await addProjectEntry(projectEntry);

      if (iconFile) {
        try {
          const storedIcon = await projectService.storeFileForProject({
            projectId,
            file: iconFile,
          });
          const storedIconFileId = storedIcon.fileId;
          await projectService.updateProjectInfoById(projectId, {
            iconFileId: storedIconFileId,
          });
          await addProjectEntry({
            ...projectEntry,
            iconFileId: storedIconFileId,
          });
          iconFileId = storedIconFileId;
          projectEntry.iconFileId = storedIconFileId;
        } catch (error) {
          console.error("Failed to save project icon:", error);
          const copy = appService.getAppCopy?.() ?? {};
          appService.showToast({
            title: copy.errorTitle ?? "Error",
            message:
              copy.failedSaveProjectIcon ??
              "The project was created, but its icon could not be saved.",
            status: "error",
          });
        }
      }

      const fullProject = {
        ...projectEntry,
        projectFileDisplayPath: getFileDisplayPath(
          projectEntry.projectFilePath,
        ),
      };
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

    initializeProjectFolderSetup: () => projectFolderSetup.load(),
    getProjectFolderSetup: () => projectFolderSetup.getStatus(),
    async previewNewProjectLocation({ name }) {
      const location = await callIOSBridge("previewNewProjectLocation", {
        name: name.trim() || "Untitled Project",
      });
      return {
        folderName: location.folderName,
        displayPath: getFileDisplayPath(location.folderPath),
      };
    },
    pickProjectFolderSetup: (options) => projectFolderSetup.pick(options),
    confirmProjectFolderSetup: (options) => projectFolderSetup.confirm(options),

    resolveProjectFolderSetupRoute(path) {
      return projectFolderSetup.getStatus().configured
        ? path
        : "/project-folder-setup";
    },

    showProgressDialog(options) {
      return createProgressDialog(options);
    },

    async loadAllProjects() {
      await syncIOSProjectEntriesFromStorage();
      return appService.loadAllProjects();
    },

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
