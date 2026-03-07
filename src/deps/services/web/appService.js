import { nanoid } from "nanoid";
import { validateIconDimensions } from "../../../utils/fileProcessors";

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

const runFileValidation = async ({ file, validation } = {}) => {
  if (!file || !validation || typeof validation !== "object") {
    return { isValid: true, message: null };
  }

  if (validation.type === "square") {
    return validateIconDimensions(file);
  }

  return { isValid: true, message: null };
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
          message: result?.message || "Invalid file selected.",
        };
      }
    }
  }

  return { isValid: true, message: null };
};

const attachUploadState = ({ file, uploadResult } = {}) => {
  if (!file) {
    return file;
  }
  const isSuccessful = !!uploadResult;
  try {
    file.uploadSucessful = isSuccessful;
    file.uploadSuccessful = isSuccessful;
    file.uploadResult = uploadResult || null;
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

/**
 * Web App Service - handles app-level operations for the browser.
 *
 * @param {Object} params
 * @param {Object} params.db - App db with { get, set, remove }
 * @param {Object} params.router - Router instance
 * @param {Object} params.globalUI - Global UI instance
 * @param {Object} params.filePicker - File picker instance
 * @param {Function} params.openUrl - Open external URL function
 * @param {string} params.appVersion - App version string
 * @param {string} params.platform - Platform identifier ("web")
 * @param {Object} params.audioService - Audio service instance
 * @param {Object} params.projectService - Project service instance for repository access
 */
export const createAppService = ({
  db,
  router,
  globalUI,
  filePicker,
  openUrl,
  appVersion,
  platform,
  audioService,
  projectService,
  subject,
}) => {
  // Initialize user config from localStorage
  const storedConfig = localStorage.getItem(USER_CONFIG_KEY);
  let currentUserConfig = storedConfig
    ? JSON.parse(storedConfig)
    : { ...DEFAULT_USER_CONFIG };

  // No-op updater for web
  const updater = {
    checkForUpdates: async () => null,
    startAutomaticChecks: () => {},
    getUpdateInfo: () => null,
    getUpdateDownloadProgress: () => 0,
    isUpdateAvailable: () => false,
  };

  const loadProjectIcon = async (projectId, iconFileId) => {
    if (!iconFileId) return null;
    try {
      const blob = await projectService.getFileByProjectId(
        projectId,
        iconFileId,
      );
      if (blob) {
        return URL.createObjectURL(blob);
      }
      return null;
    } catch (error) {
      console.error("Failed to load project icon:", error);
      return null;
    }
  };

  const createEmptyProjectEntry = ({ id = "", source = "local" } = {}) => {
    return {
      id,
      source,
      name: "",
      description: "",
      iconFileId: null,
    };
  };

  const normalizeLocalProjectEntry = (entry) => {
    return {
      ...entry,
      source: "local",
      name: entry?.name || "",
      description: entry?.description || "",
      iconFileId: entry?.iconFileId || null,
    };
  };

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

  return {
    // Project entries management
    async getProjectEntries() {
      return (await db.get("projectEntries")) || [];
    },
    async addProjectEntry(entry) {
      const entries = await this.getProjectEntries();
      const existingProject = entries.find((p) => p.id === entry.id);
      if (existingProject) {
        throw new Error("This project has already been added.");
      }
      entries.push(entry);
      await db.set("projectEntries", entries);
      if (entry?.id === getCurrentProjectId()) {
        currentProjectEntry = normalizeLocalProjectEntry(entry);
      }
      return entries;
    },
    async removeProjectEntry(projectId) {
      const entries = await this.getProjectEntries();
      const filtered = entries.filter((e) => e.id !== projectId);
      await db.set("projectEntries", filtered);
      if (currentProjectEntry.id === projectId) {
        const routeProjectId = getCurrentProjectId();
        currentProjectEntry = routeProjectId
          ? createEmptyProjectEntry({ id: routeProjectId, source: "cloud" })
          : createEmptyProjectEntry();
      }
      return filtered;
    },
    async updateProjectEntry(projectId, updates) {
      const entries = await this.getProjectEntries();
      const index = entries.findIndex((e) => e.id === projectId);
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
    },
    async loadAllProjects() {
      const projectEntries = await this.getProjectEntries();
      const projectsWithFullData = await Promise.all(
        projectEntries.map(async (entry) => {
          const project = {
            id: entry.id,
            name: entry.name || "Untitled Project",
            description: entry.description || "",
            iconFileId: entry.iconFileId || null,
            createdAt: entry.createdAt,
            lastOpenedAt: entry.lastOpenedAt,
          };
          const iconUrl = await loadProjectIcon(entry.id, project.iconFileId);
          if (iconUrl) {
            project.iconUrl = iconUrl;
          }
          return project;
        }),
      );
      return projectsWithFullData;
    },
    async validateProjectFolder() {
      return { isValid: false, error: "Not supported on web." };
    },
    async importProject() {
      throw new Error("Importing projects is not supported on the web.");
    },
    async openExistingProject() {
      throw new Error("Opening existing projects is not supported on the web.");
    },
    async createNewProject({ name, description, template }) {
      const projectId = nanoid();
      const projectEntry = {
        id: projectId,
        name,
        description,
        iconFileId: null,
        createdAt: Date.now(),
        lastOpenedAt: null,
      };
      await projectService.initializeProject({
        projectId,
        template,
      });
      await this.addProjectEntry(projectEntry);
      return { ...projectEntry };
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
    saveFilePicker(blob, filename) {
      return filePicker.saveFilePicker(blob, filename);
    },
    async pickFiles(options = {}) {
      const multiple = options.multiple ?? false;
      const upload = options.upload ?? false;
      const validations = Array.isArray(options.validations)
        ? options.validations
        : [];
      const selection = await filePicker.openFilePicker({
        ...options,
        multiple,
      });

      const files = Array.isArray(selection)
        ? selection
        : selection
          ? [selection]
          : [];
      if (files.length === 0) {
        return multiple ? [] : null;
      }

      const validationResult = await validatePickedFiles({
        files: multiple ? files : files.slice(0, 1),
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

      const filesToUpload = multiple ? files : files.slice(0, 1);
      const uploadResults = await projectService.uploadFiles(filesToUpload);

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
    },
    isInputFocused,
    getAppVersion() {
      return appVersion;
    },
    getPlatform() {
      return platform;
    },
    checkForUpdates(silent) {
      return updater.checkForUpdates(silent);
    },
    startAutomaticUpdateChecks() {
      return updater.startAutomaticChecks();
    },
    getUpdateInfo() {
      return updater.getUpdateInfo();
    },
    getUpdateDownloadProgress() {
      return updater.getUpdateDownloadProgress();
    },
    isUpdateAvailable() {
      return updater.isUpdateAvailable();
    },
    getUserConfig(key) {
      const keys = key.split(".");
      let current = currentUserConfig;
      for (const k of keys) {
        if (
          current === null ||
          current === undefined ||
          typeof current !== "object"
        ) {
          return undefined;
        }
        current = current[k];
      }
      return current;
    },
    setUserConfig(key, value) {
      const keys = key.split(".");
      let current = currentUserConfig;
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        if (!current[k]) {
          current[k] = {};
        }
        current = current[k];
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
      const existingFont = Array.from(document.fonts).find(
        (font) => font.family === fontName,
      );
      if (existingFont) {
        return existingFont;
      }
      const fontFace = new FontFace(fontName, `url(${fontUrl})`);
      await fontFace.load();
      document.fonts.add(fontFace);
      return fontFace;
    },
  };
};
