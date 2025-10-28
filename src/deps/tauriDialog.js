import { open, save } from "@tauri-apps/plugin-dialog";

export const createTauriDialog = () => {
  return {
    async openFolderDialog(options = {}) {
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

    async openFileDialog(options = {}) {
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

    async saveFileDialog(options = {}) {
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
