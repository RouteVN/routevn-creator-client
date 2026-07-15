import { createAppServiceCore } from "../shared/appServiceCore.js";
import { callAndroidBridge } from "../../clients/android/bridge.js";
import { getAndroidProjectFileUrl } from "./projectFileUrls.js";
import { generateId } from "../../../internal/id.js";
import { copyTextToClipboard } from "../../../internal/copyText.js";
import { createNativeApplicationIdentifier } from "../../../internal/nativeApplicationIdentifier.js";
import { normalizeProjectLanguage } from "../../../internal/projectLanguage.js";

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

const listAndroidProjectFolders = () => {
  try {
    const projects = callAndroidBridge("listProjectFolders");
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

export const createAppService = (params) => {
  const appDb = params.db;

  const syncAndroidProjectEntriesFromStorage = async () => {
    const discoveredProjects = listAndroidProjectFolders();
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
      if (iconFile) {
        const storedIcon = await projectService.storeFileForProject({
          projectId,
          file: iconFile,
        });
        iconFileId = storedIcon.fileId;
      }

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

    async loadAllProjects() {
      await syncAndroidProjectEntriesFromStorage();
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
