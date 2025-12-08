import { nanoid } from "nanoid";

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

  const loadProjectDataFromDatabase = async (projectId) => {
    const repository = await projectService.getRepositoryById(projectId);
    const { project } = repository.getState();
    return project;
  };

  const loadProjectIcon = async (projectId, iconFileId) => {
    if (!iconFileId) return null;
    try {
      const repository = await projectService.getRepositoryById(projectId);
      const blob = await repository.adapter.getFile(iconFileId);
      if (blob) {
        return URL.createObjectURL(blob);
      }
      return null;
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
      const existingProject = entries.find((p) => p.id === entry.id);
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
            const projectState = await loadProjectDataFromDatabase(entry.id);
            const project = {
              id: entry.id,
              name: projectState.name || "Untitled Project",
              description: projectState.description || "",
              iconFileId: projectState.iconFileId || null,
              createdAt: entry.createdAt,
              lastOpenedAt: entry.lastOpenedAt,
            };
            const iconUrl = await loadProjectIcon(entry.id, project.iconFileId);
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
              createdAt: entry.createdAt,
              lastOpenedAt: entry.lastOpenedAt,
            };
          }
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
        createdAt: Date.now(),
        lastOpenedAt: null,
      };
      await projectService.initializeProject({
        name,
        description,
        projectId,
        template,
      });
      await this.addProjectEntry(projectEntry);
      return { ...projectEntry, name, description, iconFileId: null };
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
      return filePicker.openFilePicker({ ...options, multiple: true });
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
