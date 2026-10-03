// The Android and iOS bridges expose the same import operations, so one host
// serves both. `callBridge(method, payload, { noTimeout })` is the platform's
// bridge call; `noTimeout` is set for calls that may outlive the default
// response timeout, such as a large download on a slow connection (the native
// side bounds those calls itself). `progressClient` delivers native progress
// events for a staging folder.
export const createMobileProjectImportHost = ({
  callBridge,
  progressClient,
}) => {
  const callWithProgress = async ({
    stagingId,
    method,
    payload,
    onProgress,
  }) => {
    const unsubscribe = progressClient.subscribe({ stagingId, onProgress });
    try {
      return await callBridge(method, payload, { noTimeout: true });
    } finally {
      unsubscribe();
    }
  };

  return {
    createStaging: () => callBridge("createImportStaging"),

    removeStaging: async ({ stagingId }) => {
      await callBridge("removeImportStaging", { stagingId });
    },

    download: ({ stagingId }, { url, path, maxBytes, onProgress }) =>
      callWithProgress({
        stagingId,
        method: "downloadImportFile",
        payload: { stagingId, url, path, maxBytes },
        onProgress,
      }),

    copyFile: ({ stagingId }, { uri, path, maxBytes }) =>
      callBridge(
        "copyImportFile",
        { stagingId, uri, path, maxBytes },
        { noTimeout: true },
      ),

    listArchive: async ({ stagingId }, { path, maxEntries }) => {
      const result = await callBridge("listImportArchive", {
        stagingId,
        path,
        maxEntries,
      });
      return result.entries;
    },

    extractArchive: (
      { stagingId },
      { path, destination, files, maxBytes, onProgress },
    ) =>
      callWithProgress({
        stagingId,
        method: "extractImportArchive",
        payload: { stagingId, path, destination, files, maxBytes },
        onProgress,
      }),

    // `source` is `{ stagingId }` for a staged folder or `{ uri }` for a picked
    // folder; `path` is relative to it.
    listDirectory: async (source, path) => {
      const result = await callBridge("listImportDirectory", {
        stagingId: source.stagingId,
        uri: source.uri,
        path,
      });
      return result.entries;
    },
  };
};
