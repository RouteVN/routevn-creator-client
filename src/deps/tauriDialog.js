import { open } from "@tauri-apps/plugin-dialog";

export const createTauriDialog = () => {
  return {
    async openFolderDialog(options = {}) {
      try {
        const selected = await open({
          directory: true,
          multiple: false,
          title: options.title || "Select Folder",
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
  };
};
