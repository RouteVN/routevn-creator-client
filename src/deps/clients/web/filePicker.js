// A web-based file picker to mimic the Tauri API.

const VT_FILE_PICKER_INPUT_ID = "rtglVtFilePickerInput";

const isTruthyFlag = (value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  const normalizedValue = String(value ?? "")
    .trim()
    .toLowerCase();

  return ["1", "true", "yes", "on"].includes(normalizedValue);
};

const isVtMode = () => {
  return (
    typeof window !== "undefined" &&
    isTruthyFlag(window.RTGL_VT_RESET_APP_STATE)
  );
};

const resolveAccept = (options = {}) => {
  if (typeof options.accept === "string" && options.accept.trim()) {
    return options.accept.trim();
  }

  if (Array.isArray(options.filters) && options.filters.length > 0) {
    return options.filters
      .flatMap((filter) => {
        return (filter.extensions ?? []).map((extension) => `.${extension}`);
      })
      .join(",");
  }

  return "";
};

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
        document.getElementById(VT_FILE_PICKER_INPUT_ID)?.remove();

        const input = document.createElement("input");
        input.type = "file";
        input.multiple = options.multiple || false;
        input.id = VT_FILE_PICKER_INPUT_ID;
        input.setAttribute("data-testid", VT_FILE_PICKER_INPUT_ID);
        input.accept = resolveAccept(options);

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

        // VT drives uploads by setting files directly on a stable hidden input.
        // Skipping the native picker prevents an immediate cancel/cleanup in headless runs.
        if (!isVtMode()) {
          input.click();
        }
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
