import { readDir, exists } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { convertFileSrc } from "@tauri-apps/api/core";
import { nanoid } from "nanoid";
import { validateIconDimensions } from "../../utils/fileProcessors";

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

/**
 * Check whether the currently focused element is an actionable element within the provided root.
 * Traverses into shadow DOMs to find the deep active element so we can ignore focus on document-level containers.
 *
 * @param {Document|ShadowRoot} [root=document] - Root node whose focused element should be inspected.
 * @returns {boolean} `true` when an element other than the body or dialog has focus, otherwise `false`.
 */
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
 * App Service - handles app-level operations
 *
 * Manages:
 * - Project entries (list of projects)
 * - App settings/config
 * - Navigation
 * - UI (toasts, dialogs)
 * - File picker
 * - App version and platform info
 *
 * @param {Object} params
 * @param {Object} params.db - App db with { get, set, remove }
 * @param {Object} params.router - Router instance
 * @param {Object} params.globalUI - Global UI instance
 * @param {Object} params.filePicker - File picker instance (openFolderPicker, openFilePicker, saveFilePicker)
 * @param {Function} params.openUrl - Open external URL function
 * @param {string} params.appVersion - App version string
 * @param {string} params.platform - Platform identifier (e.g., "tauri", "web")
 * @param {Object} params.updater - Updater instance
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
  updater,
  audioService,
  projectService,
  subject,
}) => {
  // Initialize user config from localStorage
  const storedConfig = localStorage.getItem(USER_CONFIG_KEY);
  let currentUserConfig = storedConfig
    ? JSON.parse(storedConfig)
    : { ...DEFAULT_USER_CONFIG };

  const deriveProjectNameFromPath = (projectPath) => {
    if (typeof projectPath !== "string" || projectPath.length === 0) {
      return "Untitled Project";
    }
    const normalizedPath = projectPath.replace(/[\\/]+$/, "");
    const segments = normalizedPath.split(/[\\/]/).filter(Boolean);
    return segments[segments.length - 1] || "Untitled Project";
  };

  const loadProjectIcon = async (projectPath, iconFileId) => {
    if (!iconFileId) return null;
    try {
      const filePath = await join(projectPath, "files", iconFileId);
      const fileExists = await exists(filePath);
      if (!fileExists) return null;
      return convertFileSrc(filePath);
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

      // Check if this project path already exists
      const existingProject = entries.find(
        (p) => p.projectPath === entry.projectPath,
      );

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
            projectPath: entry.projectPath,
            createdAt: entry.createdAt,
            lastOpenedAt: entry.lastOpenedAt,
          };

          const iconUrl = await loadProjectIcon(
            entry.projectPath,
            project.iconFileId,
          );
          if (iconUrl) {
            project.iconUrl = iconUrl;
          }

          return project;
        }),
      );

      return projectsWithFullData;
    },

    async validateProjectFolder(folderPath) {
      try {
        const dbPath = await join(folderPath, "repository.db");
        const dbExists = await exists(dbPath);

        const filesPath = await join(folderPath, "files");
        const filesExists = await exists(filesPath);

        if (!dbExists || !filesExists) {
          const missing = [];
          if (!dbExists) missing.push("repository.db");
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

    async importProject(projectPath) {
      return {
        name: deriveProjectNameFromPath(projectPath),
        description: "",
        iconFileId: null,
      };
    },

    async openExistingProject(folderPath) {
      const validation = await this.validateProjectFolder(folderPath);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      const projectData = await this.importProject(folderPath);

      const deviceProjectId = nanoid();

      const projectEntry = {
        id: deviceProjectId,
        projectPath: folderPath,
        name: projectData.name,
        description: projectData.description,
        iconFileId: projectData.iconFileId || null,
        createdAt: Date.now(),
        lastOpenedAt: null,
      };

      await this.addProjectEntry(projectEntry);

      const fullProject = {
        ...projectEntry,
      };

      if (projectData.iconFileId) {
        const iconUrl = await loadProjectIcon(
          folderPath,
          projectData.iconFileId,
        );
        if (iconUrl) {
          fullProject.iconUrl = iconUrl;
        }
      }

      return fullProject;
    },

    async createNewProject({ name, description, projectPath, template }) {
      const entries = await readDir(projectPath);
      if (entries.length > 0) {
        throw new Error(
          "The selected folder must be empty. Please choose an empty folder for your new project.",
        );
      }

      const deviceProjectId = nanoid();

      const projectEntry = {
        id: deviceProjectId,
        projectPath,
        name,
        description,
        iconFileId: null,
        createdAt: Date.now(),
        lastOpenedAt: null,
      };

      await projectService.initializeProject({
        projectPath,
        template,
      });

      await this.addProjectEntry(projectEntry);

      return {
        ...projectEntry,
      };
    },

    // App settings
    async getSetting(key) {
      return await db.get(`setting:${key}`);
    },

    async setSetting(key, value) {
      await db.set(`setting:${key}`, value);
    },

    async removeSetting(key) {
      await db.remove(`setting:${key}`);
    },

    // Navigation
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

    // UI
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

    // File pickers
    openFolderPicker(options) {
      return filePicker.openFolderPicker(options);
    },

    openFilePicker(options) {
      return filePicker.openFilePicker(options);
    },

    saveFilePicker(options) {
      return filePicker.saveFilePicker(options);
    },

    // Browser-style file picker that returns File objects (for uploads)
    pickFiles(options = {}) {
      return new Promise((resolve) => {
        const {
          accept = "*/*",
          multiple = false,
          validations = [],
          upload = false,
        } = options;

        const input = document.createElement("input");
        input.type = "file";
        input.accept = accept;
        input.multiple = multiple;
        input.style.display = "none";

        const cleanup = () => {
          if (document.body.contains(input)) {
            document.body.removeChild(input);
          }
        };

        input.onchange = async (event) => {
          const files = Array.from(event.target.files || []);
          const filesToValidate = multiple ? files : files.slice(0, 1);
          const validationResult = await validatePickedFiles({
            files: filesToValidate,
            validations,
          });

          cleanup();

          if (!validationResult.isValid) {
            globalUI.showAlert({
              message: validationResult.message,
              title: FILE_VALIDATION_ERROR_TITLE,
            });
            resolve(multiple ? [] : null);
            return;
          }

          if (!upload) {
            resolve(multiple ? files : files[0] || null);
            return;
          }

          const uploadResults =
            await projectService.uploadFiles(filesToValidate);
          if (multiple) {
            const enrichedFiles = files.map((file) => {
              const uploadResult =
                uploadResults.find((item) => item.file === file) || null;
              return attachUploadState({ file, uploadResult });
            });
            resolve(enrichedFiles);
            return;
          }

          const file = files[0] || null;
          const uploadResult =
            uploadResults.find((item) => item.file === file) ||
            uploadResults[0] ||
            null;
          resolve(attachUploadState({ file, uploadResult }));
          return;
        };

        input.oncancel = () => {
          cleanup();
          resolve(multiple ? [] : null);
        };

        document.body.appendChild(input);
        input.click();
      });
    },

    // Utils
    isInputFocused,

    // App info
    getAppVersion() {
      return appVersion;
    },

    getPlatform() {
      return platform;
    },

    // Updater
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
      return updater.getDownloadProgress();
    },

    isUpdateAvailable() {
      return updater.isUpdateAvailable();
    },

    // User config
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

    // Audio service
    getAudioService() {
      return audioService;
    },

    // Font loading
    async loadFont(fontName, fontUrl) {
      // Check if font is already loaded
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
