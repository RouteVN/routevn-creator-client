import { callIOSBridge, uint8ArrayToBase64 } from "./bridge.js";

const IOS_FILE_PICKER_INPUT_ID = "routevnIOSFilePickerInput";
const IOS_FILE_PICKER_CALLBACK = "__routeVNIOSFilePickerResult";
const IOS_SAVE_FILE_PICKER_CALLBACK = "__routeVNIOSSaveFileResult";
const IOS_FOLDER_PICKER_CALLBACK = "__routeVNIOSFolderPickerResult";

let nextIOSFilePickerRequestId = 1;
let nextIOSSaveFilePickerRequestId = 1;
let nextIOSFolderPickerRequestId = 1;
const pendingIOSFilePickers = new Map();
const pendingIOSSaveFilePickers = new Map();
const pendingIOSFolderPickers = new Map();

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

const createIOSFilePickerRequestId = () => {
  const requestId = `picker-${nextIOSFilePickerRequestId}`;
  nextIOSFilePickerRequestId += 1;
  return requestId;
};

const createIOSSaveFilePickerRequestId = () => {
  const requestId = `save-${nextIOSSaveFilePickerRequestId}`;
  nextIOSSaveFilePickerRequestId += 1;
  return requestId;
};

const createIOSFolderPickerRequestId = () => {
  const requestId = `folder-${nextIOSFolderPickerRequestId}`;
  nextIOSFolderPickerRequestId += 1;
  return requestId;
};

const resolveSaveFilename = (options = {}) => {
  return options.defaultPath || options.filename || "download";
};

const resolveSaveMimeType = (options = {}) => {
  return options.mimeType || "application/octet-stream";
};

const ensureIOSFilePickerCallback = () => {
  window[IOS_FILE_PICKER_CALLBACK] = (result = {}) => {
    const requestId = result.requestId;
    const pending = pendingIOSFilePickers.get(requestId);
    if (!pending) {
      return;
    }

    pendingIOSFilePickers.delete(requestId);
    if (result.error) {
      pending.reject(
        new Error(result.error.message || "Failed to select files."),
      );
      return;
    }

    pending.resolve(result.files ?? []);
  };
};

const ensureIOSSaveFilePickerCallback = () => {
  window[IOS_SAVE_FILE_PICKER_CALLBACK] = (result = {}) => {
    const requestId = result.requestId;
    const pending = pendingIOSSaveFilePickers.get(requestId);
    if (!pending) {
      return;
    }

    pendingIOSSaveFilePickers.delete(requestId);
    if (result.error) {
      pending.reject(
        new Error(result.error.message || "Failed to select save location."),
      );
      return;
    }

    pending.resolve(result.uri ?? null);
  };
};

const ensureIOSFolderPickerCallback = () => {
  window[IOS_FOLDER_PICKER_CALLBACK] = (result = {}) => {
    const requestId = result.requestId;
    const pending = pendingIOSFolderPickers.get(requestId);
    if (!pending) {
      return;
    }

    pendingIOSFolderPickers.delete(requestId);
    if (result.error) {
      pending.reject(
        new Error(result.error.message || "Failed to select folder."),
      );
      return;
    }

    pending.resolve(result.folder ?? null);
  };
};

const requestNativeIOSFilePicker = (options = {}) => {
  const requestId = createIOSFilePickerRequestId();
  ensureIOSFilePickerCallback();

  return new Promise((resolve, reject) => {
    pendingIOSFilePickers.set(requestId, { resolve, reject });

    callIOSBridge("openFilePicker", {
      requestId,
      multiple: options.multiple ?? false,
      accept: resolveAccept(options),
    }).catch((error) => {
      pendingIOSFilePickers.delete(requestId);
      reject(error);
    });
  });
};

const requestNativeIOSFolderPicker = (options = {}) => {
  if (isVtMode()) {
    return Promise.resolve(null);
  }

  const requestId = createIOSFolderPickerRequestId();
  ensureIOSFolderPickerCallback();

  return new Promise((resolve, reject) => {
    pendingIOSFolderPickers.set(requestId, { resolve, reject });

    callIOSBridge("openFolderPicker", {
      requestId,
      title: options.title || "Select Folder",
      writable: options.writable === true,
    }).catch((error) => {
      pendingIOSFolderPickers.delete(requestId);
      reject(error);
    });
  });
};

const requestNativeIOSSaveFilePicker = (options = {}) => {
  if (isVtMode()) {
    return Promise.resolve(resolveSaveFilename(options));
  }

  const requestId = createIOSSaveFilePickerRequestId();
  ensureIOSSaveFilePickerCallback();

  return new Promise((resolve, reject) => {
    pendingIOSSaveFilePickers.set(requestId, { resolve, reject });

    callIOSBridge("openSaveFilePicker", {
      requestId,
      filename: resolveSaveFilename(options),
      mimeType: resolveSaveMimeType(options),
    }).catch((error) => {
      pendingIOSSaveFilePickers.delete(requestId);
      reject(error);
    });
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

const resolvePickerRequestId = (descriptor = {}) => {
  if (typeof descriptor.requestId === "string" && descriptor.requestId) {
    return descriptor.requestId;
  }

  const match = String(descriptor.url ?? "").match(
    /\/ios-files\/picker\/([^/]+)\//,
  );
  return match?.[1];
};

const cleanupNativePickedFiles = (descriptors = []) => {
  const requestIds = new Set();
  for (const descriptor of descriptors) {
    const requestId = resolvePickerRequestId(descriptor);
    if (requestId) {
      requestIds.add(requestId);
    }
  }

  for (const requestId of requestIds) {
    callIOSBridge("deletePickerRequest", { requestId }).catch((error) => {
      console.warn("[ios.filePicker] Failed to clean picker files", {
        requestId,
        error: error?.message || "unknown",
      });
    });
  }
};

const readNativePickedFiles = async (descriptors) => {
  const files = [];
  try {
    for (const descriptor of descriptors) {
      files.push(await readNativePickedFile(descriptor));
    }
  } finally {
    cleanupNativePickedFiles(descriptors);
  }
  return files;
};

const openNativeFilePicker = async (options = {}) => {
  const descriptors = await requestNativeIOSFilePicker(options);
  const files = await readNativePickedFiles(descriptors);
  return options.multiple ? files : files[0] || null;
};

const openInputFilePicker = async (options = {}) => {
  return new Promise((resolve, reject) => {
    document.getElementById(IOS_FILE_PICKER_INPUT_ID)?.remove();

    const input = document.createElement("input");
    input.type = "file";
    input.multiple = options.multiple ?? false;
    input.id = IOS_FILE_PICKER_INPUT_ID;
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
    try {
      input.click();
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
};

export const createIOSFilePicker = () => {
  return {
    async openFolderPicker(options = {}) {
      return requestNativeIOSFolderPicker(options);
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
        return callIOSBridge("writeDownloadFile", {
          filename: maybeFilename || "download",
          mimeType: blobOrOptions.type || "application/octet-stream",
          base64: uint8ArrayToBase64(bytes),
        });
      }

      const filename = resolveSaveFilename(blobOrOptions);
      const bytes = toUint8Array(blobOrOptions?.bytes);
      if (!bytes) {
        return requestNativeIOSSaveFilePicker(blobOrOptions);
      }

      if (blobOrOptions?.uri) {
        return callIOSBridge("writeFileToUri", {
          uri: blobOrOptions.uri,
          mimeType: resolveSaveMimeType(blobOrOptions),
          base64: uint8ArrayToBase64(bytes),
        });
      }

      return callIOSBridge("writeDownloadFile", {
        filename,
        mimeType: blobOrOptions?.mimeType || "application/octet-stream",
        base64: uint8ArrayToBase64(bytes),
      });
    },
  };
};
