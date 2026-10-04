// The Android and iOS bridges expose the same import operations, so one host
// serves both. `callBridge(method, payload, { noTimeout })` is the platform's
// bridge call; `noTimeout` is set for calls that may outlive the default
// response timeout, such as a large download on a slow connection (the native
// side bounds those calls itself). `progressClient` delivers native progress
// events for a temporary folder.
export const createMobileProjectImportHost = ({
  callBridge,
  progressClient,
}) => {
  const callWithProgress = async ({
    tempFolderId,
    method,
    payload,
    onProgress,
  }) => {
    const unsubscribe = progressClient.subscribe({ tempFolderId, onProgress });
    try {
      return await callBridge(method, payload, { noTimeout: true });
    } finally {
      unsubscribe();
    }
  };

  return {
    createStaging: () => callBridge("createTempFolder"),

    removeStaging: async ({ tempFolderId }) => {
      await callBridge("removeTempFolder", { tempFolderId });
    },

    download: ({ tempFolderId }, { url, path, maxBytes, onProgress }) =>
      callWithProgress({
        tempFolderId,
        method: "downloadFile",
        payload: { tempFolderId, url, path, maxBytes },
        onProgress,
      }),

    copyFile: ({ tempFolderId }, { uri, path, maxBytes }) =>
      callBridge(
        "copyImportFile",
        { tempFolderId, uri, path, maxBytes },
        { noTimeout: true },
      ),

    listArchive: async ({ tempFolderId }, { path, maxEntries }) => {
      const result = await callBridge("listImportArchive", {
        tempFolderId,
        path,
        maxEntries,
      });
      return result.entries;
    },

    extractArchive: (
      { tempFolderId },
      { path, destination, files, maxBytes, onProgress },
    ) =>
      callWithProgress({
        tempFolderId,
        method: "extractImportArchive",
        payload: { tempFolderId, path, destination, files, maxBytes },
        onProgress,
      }),

    // `source` is `{ tempFolderId }` for a staged folder or `{ uri }` for a picked
    // folder; `path` is relative to it.
    listDirectory: async (source, path) => {
      const result = await callBridge("listImportDirectory", {
        tempFolderId: source.tempFolderId,
        uri: source.uri,
        path,
      });
      return result.entries;
    },
  };
};
