// A web-based file picker to mimic the Tauri API.

export const createWebFilePicker = () => {
  return {
    /**
     * Not supported on the web. Returns null.
     */
    async openFolderPicker() {
      console.warn("openFolderPicker is not supported in the web version.");
      return null;
    },

    /**
     * Open a file selection picker using a file input.
     * @param {object} options
     * @returns {Promise<File[]|File|null>} Selected file(s) or a single file.
     */
    async openFilePicker(options = {}) {
      return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = options.multiple || false;

        if (options.filters && options.filters.length > 0) {
          input.accept = options.filters
            .flatMap((filter) => filter.extensions.map((ext) => `.${ext}`))
            .join(",");
        }

        const cleanup = () => {
          if (document.body.contains(input)) {
            document.body.removeChild(input);
          }
        };

        input.onchange = (event) => {
          const files = event.target.files
            ? Array.from(event.target.files)
            : [];
          resolve(options.multiple ? files : files[0] || null);
          cleanup();
        };

        input.oncancel = () => {
          resolve(options.multiple ? [] : null);
          cleanup();
        };

        input.style.display = "none";
        document.body.appendChild(input);
        input.click();
      });
    },

    /**
     * "Saves" a file by triggering a browser download.
     * @param {Blob} blob - The file content as a Blob.
     * @param {string} defaultPath - The suggested filename.
     * @returns {Promise<void>}
     */
    async saveFilePicker(blob, defaultPath) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = defaultPath || "download";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  };
};
