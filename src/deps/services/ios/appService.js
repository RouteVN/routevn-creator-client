import { createAppServiceCore } from "../shared/appServiceCore.js";
import { callIOSBridge } from "../../clients/ios/bridge.js";
import { iosProjectImportHost } from "../../clients/ios/projectImportHost.js";
import { createProjectImportService } from "../shared/projectImportService.js";
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

// Shared registration tail for every iOS import source (folder, zip, URL):
// build the project entry from the bridge result, register it, and restore
// it to discovery if it had been removed before.
const createRegisterImportedIOSProject = ({ appDb, getFileDisplayPath }) => {
  return async ({
    importedProject,
    addProjectEntry,
    loadProjectIcon,
    projectService,
  }) => {
    const projectId = importedProject.id;
    if (!projectId) {
      throw new Error("Imported project is missing an id.");
    }

    // Native reports alreadyImported when the library already holds this
    // project. A listed project is left alone: no list entry merge, nothing
    // changed on disk. Only a project that was removed from the list is
    // restored by importing it again.
    const removedProjectIds = (await appDb.get("iosRemovedProjectIds")) ?? [];
    const isRemoved = removedProjectIds.includes(projectId);
    if (importedProject.alreadyImported === true && !isRemoved) {
      throw new Error("projectExists: This project is already in the library.");
    }

    // A hidden project is restored where it is. Older builds named its folder
    // after the id, so rename it after the project, like every other import.
    let projectFilePath = importedProject.projectFilePath;
    if (importedProject.alreadyImported === true) {
      const renamed = await callIOSBridge("renameLegacyProjectFolder", {
        projectId,
      });
      projectFilePath = renamed.projectFilePath;
    }

    const importedName = importedProject.name?.trim?.() ?? "";
    let projectName = "Untitled Project";
    if (importedName) {
      projectName = importedName;
    }

    const projectEntry = {
      id: projectId,
      projectFilePath,
      name: projectName,
      description: importedProject.description ?? "",
      language: normalizeProjectLanguage(importedProject.language),
      iconFileId: importedProject.iconFileId ?? null,
      createdAt: Date.now(),
      lastOpenedAt: null,
    };

    await addProjectEntry(projectEntry);

    // Explicitly importing a removed project restores it to discovery.
    if (isRemoved) {
      await appDb.set(
        "iosRemovedProjectIds",
        removedProjectIds.filter((id) => id !== projectId),
      );
    }

    const fullProject = {
      ...projectEntry,
      projectFileDisplayPath: getFileDisplayPath(projectEntry.projectFilePath),
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
  };
};

export const createAppService = (params) => {
  const appDb = params.db;
  const projectImport = createProjectImportService({
    host: iosProjectImportHost,
  });
  const projectFolderSetup = createIOSProjectFolderSetup({
    filePicker: params.filePicker,
  });
  const getFileDisplayPath = (filePath) =>
    formatFileDisplayPath(
      filePath,
      projectFolderSetup.getStatus().deviceName ?? "iPhone",
    );

  const registerImportedIOSProject = createRegisterImportedIOSProject({
    appDb,
    getFileDisplayPath,
  });

  const syncIOSProjectEntriesFromStorage = async () => {
    const discoveredProjects = await callIOSBridge("listProjectFolders");
    const removedProjectIds = new Set(
      (await appDb.get("iosRemovedProjectIds")) ?? [],
    );

    const entries = (await appDb.get("projectEntries")) ?? [];
    const existingEntries = Array.isArray(entries) ? entries : [];
    const existingEntriesById = new Map(
      existingEntries
        .filter((entry) => entry?.id)
        .map((entry) => [entry.id, entry]),
    );

    const nextEntries = [];
    for (const project of discoveredProjects) {
      if (removedProjectIds.has(project.id)) continue;
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

      // Rule A: the library copy stores each file under its file id. The copy
      // is renamed, never the folder the user picked.
      const fileRenames = await projectImport.planFolderFileRenames({
        list: (path) =>
          iosProjectImportHost.listDirectory(
            { uri: folderSelection.uri },
            path,
          ),
      });
      const importedProject = await callIOSBridge("importProjectFolder", {
        uri: folderSelection.uri,
        fileRenames,
      });

      return registerImportedIOSProject({
        importedProject,
        addProjectEntry,
        loadProjectIcon,
        projectService,
      });
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

  // Zip and URL imports end the same way: the extracted staging folder goes
  // through the bridge's storage step, then the project is registered.
  const importStagedProject = async ({ run }) => {
    const importedProject = await run(({ staging, path }) =>
      callIOSBridge("importProjectFolder", {
        stagingId: staging.stagingId,
        path,
      }),
    );

    return registerImportedIOSProject({
      importedProject,
      addProjectEntry: appService.addProjectEntry,
      loadProjectIcon: platformAdapter.loadProjectIcon,
      projectService: params.projectService,
    });
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

    async openArchivePicker(options = {}) {
      const archive = await params.filePicker.openArchivePicker(options);
      return archive ?? undefined;
    },

    async importProjectFromArchive({ uri, onProgress } = {}) {
      if (!uri) {
        throw new Error("importFailed: Archive uri is required.");
      }

      return importStagedProject({
        run: (finish) =>
          projectImport.importFromArchive({ uri, onProgress, finish }),
      });
    },

    async importProjectFromUrl({ url, onProgress } = {}) {
      return importStagedProject({
        run: (finish) =>
          projectImport.importFromUrl({ url, onProgress, finish }),
      });
    },

    showProgressDialog(options) {
      return (
        params.globalUI.showProgressDialog?.(options) ??
        createProgressDialog(options)
      );
    },

    async loadAllProjects() {
      await syncIOSProjectEntriesFromStorage();
      return appService.loadAllProjects();
    },

    async removeProjectEntry(projectId) {
      // Remove hides the list entry, keeping the user's folder and assets.
      // Remember the identity so later scans and folder renames keep it hidden.
      const removedProjectIds = new Set(
        (await appDb.get("iosRemovedProjectIds")) ?? [],
      );
      removedProjectIds.add(projectId);
      await appDb.set("iosRemovedProjectIds", [...removedProjectIds]);
      return appService.removeProjectEntry(projectId);
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
