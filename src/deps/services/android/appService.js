import { createAndroidBackupClient } from "../../clients/android/backup.js";
import { createBackupService } from "./backupService.js";
import { createAppServiceCore } from "../shared/appServiceCore.js";
import {
  NO_BRIDGE_TIMEOUT,
  callAndroidBridge,
} from "../../clients/android/bridge.js";
import { androidProjectImportHost } from "../../clients/android/projectImportHost.js";
import { createProjectImportService } from "../shared/projectImportService.js";
import { getAndroidProjectFileUrl } from "./projectFileUrls.js";
import { generateId } from "../../../internal/id.js";
import { copyTextToClipboard } from "../../../internal/copyText.js";
import { createNativeApplicationIdentifier } from "../../../internal/nativeApplicationIdentifier.js";
import { normalizeProjectLanguage } from "../../../internal/projectLanguage.js";

const isMediaPickerRequest = (options) => {
  const acceptedTypes = options.accept?.trim()
    ? options.accept.split(",")
    : (options.filters ?? []).flatMap((filter) =>
        (filter.extensions ?? []).map((extension) => `.${extension}`),
      );
  return (
    acceptedTypes.length > 0 &&
    acceptedTypes.every((value) => {
      const type = value.trim().toLowerCase();
      return (
        type.startsWith("image/") ||
        type.startsWith("video/") ||
        [".jpg", ".jpeg", ".png", ".webp", ".mp4"].includes(type)
      );
    })
  );
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

const listAndroidProjectFolders = async () => {
  try {
    const projects = await callAndroidBridge("listProjectFolders");
    return Array.isArray(projects) ? projects : [];
  } catch {
    return undefined;
  }
};

const toAndroidProjectEntry = ({ project, existingEntry } = {}) => {
  const projectId = project?.id ?? "";
  if (!projectId) {
    return undefined;
  }

  const projectName = project.name?.trim?.() || existingEntry?.name;

  return {
    id: projectId,
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

// Shared registration tail for every Android import source (folder, zip,
// URL): build the project entry from the bridge result and register it.
const registerImportedAndroidProject = async ({
  importedProject,
  projectId,
  addProjectEntry,
  loadProjectIcon,
  projectService,
}) => {
  const importedName = importedProject.name?.trim?.() ?? "";
  let projectName = "Untitled Project";
  if (importedName) {
    projectName = importedName;
  }

  const projectEntry = {
    id: projectId,
    name: projectName,
    description: importedProject.description ?? "",
    language: normalizeProjectLanguage(importedProject.language),
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
};

export const createAppService = (params) => {
  const appDb = params.db;
  const { globalUI } = params;
  const projectImport = createProjectImportService({
    host: androidProjectImportHost,
  });

  const syncAndroidProjectEntriesFromStorage = async () => {
    const discoveredProjects = await listAndroidProjectFolders();
    if (!discoveredProjects) {
      return;
    }

    const entries = (await appDb.get("projectEntries")) || [];
    const existingEntries = Array.isArray(entries) ? entries : [];
    const existingEntriesById = new Map(
      existingEntries
        .filter((entry) => entry?.id)
        .map((entry) => [entry.id, entry]),
    );

    const nextEntries = [];
    for (const project of discoveredProjects) {
      const entry = toAndroidProjectEntry({
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
    isDuplicateProjectEntry: ({ entries, entry }) => {
      return entries.some((project) => project.id === entry.id);
    },

    mapProjectEntryToProject: () => ({}),

    loadProjectIcon: async ({ entry }) => {
      if (!entry?.id || !entry?.iconFileId) return null;

      try {
        return getAndroidProjectFileUrl({
          projectId: entry.id,
          fileId: entry.iconFileId,
        });
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

      // Rule A: the app copy stores each file under its file id. The copy is
      // renamed, never the folder the user picked.
      const fileRenames = await projectImport.planFolderFileRenames({
        list: (path) =>
          androidProjectImportHost.listDirectory(
            { uri: folderSelection.uri },
            path,
          ),
      });

      const projectId = generateId();
      const importedProject = await callAndroidBridge("importProjectFolder", {
        uri: folderSelection.uri,
        projectId,
        fileRenames,
      });
      if (importedProject.id !== projectId) {
        throw new Error("Imported project identity does not match.");
      }

      return registerImportedAndroidProject({
        importedProject,
        projectId,
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

    selectFiles: async ({ options, multiple, filePicker }) => {
      let source = "files";
      if (isMediaPickerRequest(options)) {
        const copy = appService.getAppCopy();
        const result = await globalUI.showFormDialog({
          size: "sm",
          form: {
            title: copy.filePickerSourceTitle ?? "Choose source",
            fields: [],
            actions: {
              layout: "vertical",
              buttons: [
                {
                  id: "gallery",
                  label: copy.filePickerGallery ?? "Gallery",
                  variant: "se",
                },
                {
                  id: "files",
                  label: copy.filePickerFiles ?? "File picker",
                  variant: "se",
                },
              ],
            },
          },
        });
        if (!result) return multiple ? [] : undefined;
        source = result.actionId;
      }
      return filePicker.openFilePicker({
        ...options,
        multiple,
        source,
      });
    },
  };

  // Zip and URL imports end the same way: the extracted staging folder goes
  // through the bridge's storage step with a new project id, then the project
  // is registered.
  const importStagedProject = async ({ run }) => {
    const projectId = generateId();
    const importedProject = await run(({ staging, path }) =>
      callAndroidBridge(
        "importProjectFolder",
        { stagingId: staging.stagingId, path, projectId },
        { timeoutMs: NO_BRIDGE_TIMEOUT },
      ),
    );
    if (importedProject.id !== projectId) {
      throw new Error("importFailed: Imported project identity mismatch.");
    }

    const project = await registerImportedAndroidProject({
      importedProject,
      projectId,
      addProjectEntry: appService.addProjectEntry,
      loadProjectIcon: platformAdapter.loadProjectIcon,
      projectService: params.projectService,
    });
    backup.backupNewProject();
    return project;
  };

  const appService = createAppServiceCore({
    ...params,
    platformAdapter,
  });

  const backup = createBackupService({
    client: createAndroidBackupClient(params.appActivity),
    backupProject: (id) => params.projectService.backupProject(id),
    beforeBackup: () => appService.prepareNavigation({ reason: "backup" }),
    notify: (options) => appService.showToast(options),
  });

  return {
    ...appService,
    initializeBackup: backup.initialize,
    getBackupStatus: backup.getStatus,
    subscribeBackup: backup.subscribe,
    refreshBackupStatus: backup.refresh,
    backupNow: () => backup.run(true),
    startBackupChecks: backup.start,
    getProjectFolderSetup: () => ({ ...backup.getStatus(), isBackup: true }),
    pickProjectFolderSetup: (options) =>
      params.filePicker.openFolderPicker({
        ...options,
        writable: true,
        startInDocuments: !backup.getStatus().configured,
      }),
    confirmProjectFolderSetup: backup.configure,
    disableBackup: backup.disable,

    showProgressDialog(options) {
      return globalUI.showProgressDialog(options);
    },

    async loadAllProjects() {
      await syncAndroidProjectEntriesFromStorage();
      return appService.loadAllProjects();
    },

    async createNewProject(payload) {
      const project = await appService.createNewProject(payload);
      backup.backupNewProject();
      return project;
    },

    async openExistingProject(folderPath) {
      const project = await appService.openExistingProject(folderPath);
      backup.backupNewProject();
      return project;
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

    async deleteProject(projectId) {
      return callAndroidBridge("deleteProject", { projectId });
    },

    async discardPendingSaveDocument(uri) {
      return callAndroidBridge("discardPendingSaveDocument", { uri });
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
