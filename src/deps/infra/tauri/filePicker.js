import { open, save } from "@tauri-apps/plugin-dialog";

/**
 * @typedef {Object} FileFilter
 * @property {string} name - Filter name (e.g., "Images")
 * @property {string[]} extensions - File extensions without dots (e.g., ["png", "jpg"])
 */

/**
 * @typedef {Object} OpenFolderOptions
 * @property {string} [title] - Dialog title
 * @property {string} [defaultPath] - Default path to open
 */

/**
 * @typedef {Object} OpenFileOptions
 * @property {string} [title] - Dialog title
 * @property {boolean} [multiple] - Allow multiple file selection
 * @property {FileFilter[]} [filters] - File type filters
 * @property {string} [defaultPath] - Default path to open
 */

/**
 * @typedef {Object} SaveFileOptions
 * @property {string} [title] - Dialog title
 * @property {FileFilter[]} [filters] - File type filters
 * @property {string} [defaultPath] - Default file path/name
 */

/**
 * Create a Tauri native file picker
 * @returns {Object} File picker with openFolderPicker, openFilePicker, saveFilePicker
 */
export const createTauriFilePicker = () => {
  return {
    /**
     * Open a folder selection picker
     * @param {OpenFolderOptions} [options]
     * @returns {Promise<string|null>} Selected folder path or null if cancelled
     */
    async openFolderPicker(options = {}) {
      try {
        const selected = await open({
          directory: true,
          multiple: false,
          title: options.title || "Select Folder",
          recursive: true,
          ...options,
        });
        return selected;
      } catch (error) {
        console.error("Error opening folder dialog:", error);
        throw error;
      }
    },

    /**
     * Open a file selection picker
     * @param {OpenFileOptions} [options]
     * @returns {Promise<string|string[]|null>} Selected file path(s) or null if cancelled
     */
    async openFilePicker(options = {}) {
      try {
        const selected = await open({
          directory: false,
          multiple: options.multiple || false,
          title: options.title || "Select File",
          filters: options.filters || [],
          ...options,
        });
        return selected;
      } catch (error) {
        console.error("Error opening file dialog:", error);
        throw error;
      }
    },

    /**
     * Open a save file picker
     * @param {SaveFileOptions} [options]
     * @returns {Promise<string|null>} Selected save path or null if cancelled
     */
    async saveFilePicker(options = {}) {
      try {
        const selected = await save({
          title: options.title || "Save File",
          filters: options.filters || [],
          defaultPath: options.defaultPath,
          ...options,
        });
        return selected;
      } catch (error) {
        console.error("Error opening save dialog:", error);
        throw error;
      }
    },
  };
};
