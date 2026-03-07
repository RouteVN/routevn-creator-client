import { validateIconDimensions } from "../../../utils/fileProcessors.js";
import { loadFont } from "./fontLoader.js";

const DEFAULT_USER_CONFIG = {
  groupImagesView: {
    zoomLevel: 1.0,
  },
  scenesMap: {
    zoomLevel: 1.5,
    panX: -120,
    panY: -200,
  },
};

const USER_CONFIG_KEY = "routevn-user-config";
const FILE_VALIDATION_ERROR_TITLE = "Error";

const createNoopUpdater = () => ({
  checkForUpdates: async () => null,
  startAutomaticChecks: () => {},
  getUpdateInfo: () => null,
  getDownloadProgress: () => 0,
  isUpdateAvailable: () => false,
});

const runFileValidation = async ({ file, validation } = {}) => {
  if (!file || !validation || typeof validation !== "object") {
    return { isValid: true, message: undefined };
  }

  if (validation.type === "square") {
    return validateIconDimensions(file);
  }

  return { isValid: true, message: undefined };
};

const validatePickedFiles = async ({ files, validations } = {}) => {
  const fileList = Array.isArray(files) ? files : [];
  const validationList = Array.isArray(validations) ? validations : [];

  for (const file of fileList) {
    for (const validation of validationList) {
      const result = await runFileValidation({ file, validation });
      if (!result?.isValid) {
        return {
          isValid: false,
          message: result?.message ?? "Invalid file selected.",
        };
      }
    }
  }

  return { isValid: true, message: undefined };
};

const attachUploadState = ({ file, uploadResult } = {}) => {
  if (!file) {
    return file;
  }

  const isSuccessful = Boolean(uploadResult);
  try {
    file.uploadSucessful = isSuccessful;
    file.uploadSuccessful = isSuccessful;
    file.uploadResult = uploadResult ?? null;
  } catch {
    // Ignore if File object cannot be extended in this runtime.
  }

  return file;
};

const isInputFocused = (root = document) => {
  let active = root.activeElement;
  while (active && active.shadowRoot && active.shadowRoot.activeElement) {
    active = active.shadowRoot.activeElement;
  }
  if (active) {
    const tagName = active.tagName;
    if (!["BODY", "DIALOG"].includes(tagName)) {
      return true;
    }
  }
  return false;
};

const loadUserConfig = () => {
  const storedConfig = localStorage.getItem(USER_CONFIG_KEY);
  if (!storedConfig) {
    return { ...DEFAULT_USER_CONFIG };
  }

  try {
    return JSON.parse(storedConfig);
  } catch {
    return { ...DEFAULT_USER_CONFIG };
  }
};

const createEmptyProjectEntry = ({ id = "", source = "local" } = {}) => ({
  id,
  source,
  name: "",
  description: "",
  iconFileId: null,
});

const normalizeLocalProjectEntry = (entry) => ({
  ...entry,
  source: "local",
  name: entry?.name ?? "",
  description: entry?.description ?? "",
  iconFileId: entry?.iconFileId ?? null,
});

export const createAppServiceCore = ({
  db,
  router,
  globalUI,
  filePicker,
  openUrl,
  appVersion,
  platform,
  updater,
  audioService,
  projectService,
  subject,
  platformAdapter = {},
}) => {
  const resolvedUpdater = {
    ...createNoopUpdater(),
    ...updater,
  };

  let currentUserConfig = loadUserConfig();
  let currentProjectEntry = createEmptyProjectEntry();

  const getCurrentProjectId = () => {
    return router.getPayload()?.p ?? "";
  };

  const resolveCurrentProjectEntry = async () => {
    const projectId = getCurrentProjectId();
    if (!projectId) {
      return createEmptyProjectEntry();
    }

    try {
      const entries = (await db.get("projectEntries")) || [];
      if (!Array.isArray(entries)) {
        return createEmptyProjectEntry({ id: projectId, source: "local" });
      }

      const localEntry = entries.find((entry) => entry?.id === projectId);
      if (localEntry) {
        return normalizeLocalProjectEntry(localEntry);
      }

      return createEmptyProjectEntry({
        id: projectId,
        source: "cloud",
      });
    } catch {
      return createEmptyProjectEntry({ id: projectId, source: "local" });
    }
  };

  const refreshCurrentProjectEntry = async () => {
    currentProjectEntry = await resolveCurrentProjectEntry();
    return currentProjectEntry;
  };

  const getProjectEntries = async () => {
    return (await db.get("projectEntries")) || [];
  };

  const addProjectEntry = async (entry) => {
    const entries = await getProjectEntries();
    const isDuplicate = platformAdapter.isDuplicateProjectEntry?.({
      entries,
      entry,
    });
    if (isDuplicate) {
      throw new Error("This project has already been added.");
    }

    entries.push(entry);
    await db.set("projectEntries", entries);
    if (entry?.id === getCurrentProjectId()) {
      currentProjectEntry = normalizeLocalProjectEntry(entry);
    }
    return entries;
  };

  const removeProjectEntry = async (projectId) => {
    const entries = await getProjectEntries();
    const filtered = entries.filter((entry) => entry.id !== projectId);
    await db.set("projectEntries", filtered);
    if (currentProjectEntry.id === projectId) {
      const routeProjectId = getCurrentProjectId();
      currentProjectEntry = routeProjectId
        ? createEmptyProjectEntry({ id: routeProjectId, source: "cloud" })
        : createEmptyProjectEntry();
    }
    return filtered;
  };

  const updateProjectEntry = async (projectId, updates) => {
    const entries = await getProjectEntries();
    const index = entries.findIndex((entry) => entry.id === projectId);
    if (index !== -1) {
      entries[index] = { ...entries[index], ...updates };
      await db.set("projectEntries", entries);
      if (
        currentProjectEntry.id === projectId &&
        currentProjectEntry.source === "local"
      ) {
        currentProjectEntry = normalizeLocalProjectEntry(entries[index]);
      }
    }
    return entries;
  };

  const loadAllProjects = async () => {
    const projectEntries = await getProjectEntries();
    const projectsWithFullData = await Promise.all(
      projectEntries.map(async (entry) => {
        const project = {
          id: entry.id,
          name: entry.name || "Untitled Project",
          description: entry.description || "",
          iconFileId: entry.iconFileId || null,
          createdAt: entry.createdAt,
          lastOpenedAt: entry.lastOpenedAt,
          ...platformAdapter.mapProjectEntryToProject?.(entry),
        };

        const iconUrl = await platformAdapter.loadProjectIcon?.({
          entry,
          projectService,
        });
        if (iconUrl) {
          project.iconUrl = iconUrl;
        }

        return project;
      }),
    );

    return projectsWithFullData;
  };

  const pickFiles = async (options = {}) => {
    const multiple = options.multiple ?? false;
    const upload = options.upload ?? false;
    const validations = Array.isArray(options.validations)
      ? options.validations
      : [];

    const selection = await platformAdapter.selectFiles({
      options,
      multiple,
      filePicker,
    });

    const files = Array.isArray(selection)
      ? selection
      : selection
        ? [selection]
        : [];

    if (files.length === 0) {
      return multiple ? [] : null;
    }

    const filesToValidate = multiple ? files : files.slice(0, 1);
    const validationResult = await validatePickedFiles({
      files: filesToValidate,
      validations,
    });

    if (!validationResult.isValid) {
      globalUI.showAlert({
        message: validationResult.message,
        title: FILE_VALIDATION_ERROR_TITLE,
      });
      return multiple ? [] : null;
    }

    if (!upload) {
      return multiple ? files : files[0] || null;
    }

    const uploadResults = await projectService.uploadFiles(filesToValidate);
    if (multiple) {
      return files.map((file) => {
        const uploadResult =
          uploadResults.find((item) => item.file === file) || null;
        return attachUploadState({ file, uploadResult });
      });
    }

    const file = files[0] || null;
    const uploadResult =
      uploadResults.find((item) => item.file === file) ||
      uploadResults[0] ||
      null;
    return attachUploadState({ file, uploadResult });
  };

  return {
    async getProjectEntries() {
      return getProjectEntries();
    },

    async addProjectEntry(entry) {
      return addProjectEntry(entry);
    },

    async removeProjectEntry(projectId) {
      return removeProjectEntry(projectId);
    },

    async updateProjectEntry(projectId, updates) {
      return updateProjectEntry(projectId, updates);
    },

    async loadAllProjects() {
      return loadAllProjects();
    },

    async validateProjectFolder(folderPath) {
      return platformAdapter.validateProjectFolder(folderPath);
    },

    async importProject(projectPath) {
      return platformAdapter.importProject(projectPath);
    },

    async openExistingProject(folderPath) {
      return platformAdapter.openExistingProject({
        folderPath,
        addProjectEntry,
        loadProjectIcon: platformAdapter.loadProjectIcon,
        projectService,
      });
    },

    async createNewProject(payload) {
      return platformAdapter.createNewProject({
        ...payload,
        addProjectEntry,
        projectService,
      });
    },

    async getSetting(key) {
      return await db.get(`setting:${key}`);
    },

    async setSetting(key, value) {
      await db.set(`setting:${key}`, value);
    },

    async removeSetting(key) {
      await db.remove(`setting:${key}`);
    },

    navigate(path, payload) {
      subject.dispatch("redirect", { path, payload });
    },

    redirect(path, payload) {
      router.redirect(path, payload);
    },

    getPath() {
      return router.getPathName();
    },

    getPayload() {
      return router.getPayload();
    },

    getCurrentProjectId() {
      return getCurrentProjectId();
    },

    getCurrentProjectEntry() {
      return currentProjectEntry;
    },

    async refreshCurrentProjectEntry() {
      return refreshCurrentProjectEntry();
    },

    setPayload(payload) {
      router.setPayload(payload);
    },

    back() {
      router.back();
    },

    openUrl,

    showToast(message, options = {}) {
      globalUI.showAlert({ message, title: options.title || "Notice" });
    },

    showDialog(options) {
      return globalUI.showConfirm(options);
    },

    closeAll() {
      return globalUI.closeAll();
    },

    showDropdownMenu(options) {
      return globalUI.showDropdownMenu(options);
    },

    openFolderPicker(options) {
      return filePicker.openFolderPicker(options);
    },

    openFilePicker(options) {
      return filePicker.openFilePicker(options);
    },

    saveFilePicker(...args) {
      return filePicker.saveFilePicker(...args);
    },

    async pickFiles(options = {}) {
      return pickFiles(options);
    },

    isInputFocused,

    getAppVersion() {
      return appVersion;
    },

    getPlatform() {
      return platform;
    },

    checkForUpdates(silent) {
      return resolvedUpdater.checkForUpdates(silent);
    },

    startAutomaticUpdateChecks() {
      return resolvedUpdater.startAutomaticChecks();
    },

    getUpdateInfo() {
      return resolvedUpdater.getUpdateInfo();
    },

    getUpdateDownloadProgress() {
      return resolvedUpdater.getDownloadProgress();
    },

    isUpdateAvailable() {
      return resolvedUpdater.isUpdateAvailable();
    },

    getUserConfig(key) {
      const keys = key.split(".");
      let current = currentUserConfig;

      for (const itemKey of keys) {
        if (
          current === null ||
          current === undefined ||
          typeof current !== "object"
        ) {
          return undefined;
        }
        current = current[itemKey];
      }

      return current;
    },

    setUserConfig(key, value) {
      const keys = key.split(".");
      let current = currentUserConfig;

      for (let index = 0; index < keys.length - 1; index++) {
        const itemKey = keys[index];
        if (!current[itemKey]) {
          current[itemKey] = {};
        }
        current = current[itemKey];
      }

      const targetKey = keys[keys.length - 1];
      current[targetKey] = value;
      localStorage.setItem(USER_CONFIG_KEY, JSON.stringify(currentUserConfig));
    },

    getAllUserConfig() {
      return currentUserConfig;
    },

    getAudioService() {
      return audioService;
    },

    async loadFont(fontName, fontUrl) {
      return loadFont(fontName, fontUrl);
    },
  };
};
