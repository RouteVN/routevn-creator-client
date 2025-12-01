import { readDir, exists } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { convertFileSrc } from "@tauri-apps/api/core";
import { nanoid } from "nanoid";

const DEFAULT_USER_CONFIG = {
  groupImagesView: {
    zoomLevel: 1.0,
  },
  scenesMap: {
    zoomLevel: 1.0,
    panX: 0,
    panY: 0,
  },
};

const USER_CONFIG_KEY = "routevn-user-config";

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

  const loadProjectDataFromDatabase = async (projectPath) => {
    const repository = await projectService.getRepositoryByPath(projectPath);
    const { project } = repository.getState();
    return project;
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
      return entries;
    },

    async removeProjectEntry(projectId) {
      const entries = await this.getProjectEntries();
      const filtered = entries.filter((e) => e.id !== projectId);
      await db.set("projectEntries", filtered);
      return filtered;
    },

    async updateProjectEntry(projectId, updates) {
      const entries = await this.getProjectEntries();
      const index = entries.findIndex((e) => e.id === projectId);
      if (index !== -1) {
        entries[index] = { ...entries[index], ...updates };
        await db.set("projectEntries", entries);
      }
      return entries;
    },

    async loadAllProjects() {
      const projectEntries = await this.getProjectEntries();

      const projectsWithFullData = await Promise.all(
        projectEntries.map(async (entry) => {
          try {
            const projectState = await loadProjectDataFromDatabase(
              entry.projectPath,
            );

            const project = {
              id: entry.id,
              name: projectState.name || "Untitled Project",
              description: projectState.description || "",
              iconFileId: projectState.iconFileId || null,
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
          } catch (error) {
            console.error(
              `Failed to load project data for ${entry.id}:`,
              error,
            );
            return {
              id: entry.id,
              name: "Error loading project",
              description: "Unable to read project data",
              projectPath: entry.projectPath,
              createdAt: entry.createdAt,
              lastOpenedAt: entry.lastOpenedAt,
            };
          }
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
      const projectState = await loadProjectDataFromDatabase(projectPath);

      if (!projectState.name || !projectState.description) {
        throw new Error(
          "Project database is missing required project information (name or description)",
        );
      }

      return {
        name: projectState.name,
        description: projectState.description,
        iconFileId: projectState.iconFileId || null,
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
        createdAt: Date.now(),
        lastOpenedAt: null,
      };

      await this.addProjectEntry(projectEntry);

      const fullProject = {
        ...projectEntry,
        name: projectData.name,
        description: projectData.description,
        iconFileId: projectData.iconFileId,
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
        createdAt: Date.now(),
        lastOpenedAt: null,
      };

      await projectService.initializeProject({
        name,
        description,
        projectPath,
        template,
      });

      await this.addProjectEntry(projectEntry);

      return {
        ...projectEntry,
        name,
        description,
        iconFileId: null,
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
        const { accept = "*/*", multiple = false } = options;

        const input = document.createElement("input");
        input.type = "file";
        input.accept = accept;
        input.multiple = multiple;
        input.style.display = "none";

        input.onchange = (event) => {
          const files = Array.from(event.target.files || []);
          document.body.removeChild(input);
          resolve(files);
        };

        input.oncancel = () => {
          document.body.removeChild(input);
          resolve([]);
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
