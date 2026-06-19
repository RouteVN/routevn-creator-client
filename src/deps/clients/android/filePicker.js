import { callAndroidBridge, uint8ArrayToBase64 } from "./bridge.js";

const ANDROID_FILE_PICKER_INPUT_ID = "routevnAndroidFilePickerInput";
const ANDROID_FILE_PICKER_CALLBACK = "__routeVNAndroidFilePickerResult";

let nextAndroidFilePickerRequestId = 1;
const pendingAndroidFilePickers = new Map();

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

const toUint8Array = (value) => {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }

  return undefined;
};

const createFileFromBytes = ({ file, bytes }) => {
  const name = file?.name || "selected-file";
  const options = {
    type: file?.type || "application/octet-stream",
    lastModified: file?.lastModified || Date.now(),
  };

  try {
    return new File([bytes], name, options);
  } catch {
    const blob = new Blob([bytes], { type: options.type });
    Object.defineProperty(blob, "name", {
      value: name,
      writable: false,
    });
    Object.defineProperty(blob, "lastModified", {
      value: options.lastModified,
      writable: false,
    });
    return blob;
  }
};

const createFileFromBlob = ({ descriptor, blob }) => {
  const name = descriptor?.name || "selected-file";
  const options = {
    type: descriptor?.type || blob?.type || "application/octet-stream",
    lastModified: Date.now(),
  };

  try {
    return new File([blob], name, options);
  } catch {
    const fallbackBlob = new Blob([blob], { type: options.type });
    Object.defineProperty(fallbackBlob, "name", {
      value: name,
      writable: false,
    });
    Object.defineProperty(fallbackBlob, "lastModified", {
      value: options.lastModified,
      writable: false,
    });
    return fallbackBlob;
  }
};

const clonePickedFile = async (file) => {
  const bytes = await file.arrayBuffer();
  return createFileFromBytes({ file, bytes });
};

const clonePickedFiles = async (files) => {
  const clonedFiles = [];
  for (const file of files) {
    clonedFiles.push(await clonePickedFile(file));
  }
  return clonedFiles;
};

const createAndroidFilePickerRequestId = () => {
  const requestId = `picker-${nextAndroidFilePickerRequestId}`;
  nextAndroidFilePickerRequestId += 1;
  return requestId;
};

const ensureAndroidFilePickerCallback = () => {
  window[ANDROID_FILE_PICKER_CALLBACK] = (result = {}) => {
    const requestId = result.requestId;
    const pending = pendingAndroidFilePickers.get(requestId);
    if (!pending) {
      return;
    }

    pendingAndroidFilePickers.delete(requestId);
    if (result.error) {
      pending.reject(
        new Error(result.error.message || "Failed to select files."),
      );
      return;
    }

    pending.resolve(result.files ?? []);
  };
};

const requestNativeAndroidFilePicker = (options = {}) => {
  const requestId = createAndroidFilePickerRequestId();
  ensureAndroidFilePickerCallback();

  return new Promise((resolve, reject) => {
    pendingAndroidFilePickers.set(requestId, { resolve, reject });

    try {
      callAndroidBridge("openFilePicker", {
        requestId,
        multiple: options.multiple ?? false,
        accept: resolveAccept(options),
      });
    } catch (error) {
      pendingAndroidFilePickers.delete(requestId);
      reject(error);
    }
  });
};

const readNativePickedFile = async (descriptor) => {
  const response = await fetch(descriptor.url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to read selected file.");
  }

  const blob = await response.blob();
  return createFileFromBlob({ descriptor, blob });
};

const readNativePickedFiles = async (descriptors) => {
  const files = [];
  for (const descriptor of descriptors) {
    files.push(await readNativePickedFile(descriptor));
  }
  return files;
};

const openNativeFilePicker = async (options = {}) => {
  const descriptors = await requestNativeAndroidFilePicker(options);
  const files = await readNativePickedFiles(descriptors);
  return options.multiple ? files : files[0] || null;
};

const openInputFilePicker = async (options = {}) => {
  return new Promise((resolve, reject) => {
    document.getElementById(ANDROID_FILE_PICKER_INPUT_ID)?.remove();

    const input = document.createElement("input");
    input.type = "file";
    input.multiple = options.multiple ?? false;
    input.id = ANDROID_FILE_PICKER_INPUT_ID;
    input.accept = resolveAccept(options);
    input.style.display = "none";

    const cleanup = () => {
      if (document.body.contains(input)) {
        document.body.removeChild(input);
      }
    };

    input.onchange = async (event) => {
      const files = event.target.files ? Array.from(event.target.files) : [];

      try {
        const clonedFiles = await clonePickedFiles(files);
        resolve(options.multiple ? clonedFiles : clonedFiles[0] || null);
      } catch (error) {
        reject(error);
      } finally {
        cleanup();
      }
    };

    input.oncancel = () => {
      cleanup();
      resolve(options.multiple ? [] : null);
    };

    document.body.appendChild(input);
  });
};

export const createAndroidFilePicker = () => {
  return {
    async openFolderPicker() {
      return null;
    },

    async openFilePicker(options = {}) {
      if (isVtMode()) {
        return openInputFilePicker(options);
      }

      return openNativeFilePicker(options);
    },

    async saveFilePicker(blobOrOptions, maybeFilename) {
      if (blobOrOptions instanceof Blob) {
        const bytes = new Uint8Array(await blobOrOptions.arrayBuffer());
        return callAndroidBridge("writeDownloadFile", {
          filename: maybeFilename || "download",
          mimeType: blobOrOptions.type || "application/octet-stream",
          base64: uint8ArrayToBase64(bytes),
        });
      }

      const filename =
        blobOrOptions?.defaultPath || blobOrOptions?.filename || "download";
      const bytes = toUint8Array(blobOrOptions?.bytes);
      if (!bytes) {
        return null;
      }

      return callAndroidBridge("writeDownloadFile", {
        filename,
        mimeType: blobOrOptions?.mimeType || "application/octet-stream",
        base64: uint8ArrayToBase64(bytes),
      });
    },
  };
};
